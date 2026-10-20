// FSRCNN-small: native decoded pixels -> BT.601 luma -> five learned layers.
// Production frames remain on the GPU. Chroma is deliberately approximated by
// bilinear RGB plus the predicted-minus-bilinear luminance delta.
const PARAMS = `struct Params { origin: vec2<i32>, full: vec2<u32>, tile: vec2<u32>, spare: vec2<u32> };`;
const THREADS = 64;
const HALO = 3;

function validateModel(model) {
  const shapes = [[5, 1, 32], [1, 32, 5], [3, 5, 5], [1, 5, 32], [1, 32, model?.scale ** 2]];
  if (model?.schemaVersion !== 1 || ![2, 3].includes(model.scale) || model.halo !== HALO || model.layers?.length !== 5 || !Number.isFinite(model.outputBias)) {
    throw new Error('Unsupported FSRCNN-small model');
  }
  for (let i = 0; i < shapes.length; i++) {
    const layer = model.layers[i], [kernel, input, output] = shapes[i];
    if (layer.kernelSize !== kernel || layer.inChannels !== input || layer.outChannels !== output ||
        layer.weights?.length !== kernel * kernel * input * output ||
        (i < 4 && (layer.bias?.length !== output || layer.alpha?.length !== output)) ||
        (i === 4 && (layer.bias != null || layer.alpha != null)) ||
        ![...layer.weights, ...(layer.bias || []), ...(layer.alpha || [])].every(Number.isFinite)) {
      throw new Error(`Invalid FSRCNN-small layer ${i}`);
    }
  }
}

function convolutionShader(layer, final) {
  const {kernelSize: k, inChannels: input, outChannels: output} = layer;
  const count = k * k * input * output;
  return `${PARAMS}
@group(0) @binding(0) var<storage, read> source: array<f32>;
@group(0) @binding(1) var<storage, read_write> destination: array<f32>;
@group(0) @binding(2) var<storage, read> learned: array<f32>;
@group(0) @binding(3) var<uniform> p: Params;
@compute @workgroup_size(${THREADS}) fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = gid.x;
  if (n >= p.tile.x * p.tile.y * ${output}u) { return; }
  let channel = n % ${output}u;
  let pixel = n / ${output}u;
  let xy = vec2<i32>(i32(pixel % p.tile.x), i32(pixel / p.tile.x));
  let global = p.origin + xy;
  // Zero at the REAL frame edge at every layer, including after bias/PReLU.
  if (any(global < vec2<i32>(0)) || any(global >= vec2<i32>(p.full))) { destination[n] = 0.0; return; }
  var sum = ${final ? '0.0' : `learned[${count}u + channel]`};
  for (var ky = 0; ky < ${k}; ky++) {
    for (var kx = 0; kx < ${k}; kx++) {
      let at = xy + vec2<i32>(kx - ${Math.floor(k / 2)}, ky - ${Math.floor(k / 2)});
      if (all(at >= vec2<i32>(0)) && all(at < vec2<i32>(p.tile))) {
        let base = (u32(at.y) * p.tile.x + u32(at.x)) * ${input}u;
        for (var c = 0u; c < ${input}u; c++) {
          let weight = ((u32(ky * ${k} + kx) * ${input}u + c) * ${output}u) + channel;
          sum += source[base + c] * learned[weight];
        }
      }
    }
  }
  destination[n] = ${final ? 'sum' : `max(0.0, sum) + learned[${count + output}u + channel] * min(0.0, sum)`};
}`;
}

const INITIALIZE = `${PARAMS}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> destination: array<f32>;
@group(0) @binding(2) var<uniform> p: Params;
@compute @workgroup_size(${THREADS}) fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= p.tile.x * p.tile.y) { return; }
  let pos = p.origin + vec2<i32>(i32(gid.x % p.tile.x), i32(gid.x / p.tile.x));
  var value = 0.0;
  if (all(pos >= vec2<i32>(0)) && all(pos < vec2<i32>(p.full))) {
    value = dot(textureLoad(image, pos, 0).rgb, vec3<f32>(0.299, 0.587, 0.114));
  }
  destination[gid.x] = value;
}`;

function outputShader(scale, outputBias) {
  return `${PARAMS}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var filtering: sampler;
@group(0) @binding(2) var<storage, read> predicted: array<f32>;
@group(0) @binding(3) var<uniform> p: Params;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let xy = array<vec2<f32>, 3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
  return vec4<f32>(xy[i], 0, 1);
}
@fragment fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let out = vec2<u32>(position.xy);
  let low = vec2<i32>(out / ${scale}u) - p.origin;
  let channel = (out.y % ${scale}u) * ${scale}u + out.x % ${scale}u;
  let luminance = clamp(predicted[(u32(low.y) * p.tile.x + u32(low.x)) * ${scale * scale}u + channel] + f32(${outputBias}), 0.0, 1.0);
  let rgb = textureSampleLevel(image, filtering, position.xy / (vec2<f32>(p.full) * ${scale}.0), 0.0).rgb;
  let delta = luminance - dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
  return vec4<f32>(clamp(rgb + vec3<f32>(delta), vec3<f32>(0), vec3<f32>(1)), 1);
}`;
}

/** Create a single-frame-in-flight renderer. Injected devices remain caller-owned. */
export async function createWebGpuUpscaler({canvas, model, tileSize = 256, device: suppliedDevice} = {}) {
  validateModel(model);
  if (!canvas?.getContext || !Number.isInteger(tileSize) || tileSize < 1) throw new Error('Invalid AI canvas or tile size');
  const {GPUBufferUsage: BU, GPUTextureUsage: TU} = globalThis;
  if (!navigator.gpu || !BU) throw new Error('WebGPU is unavailable');
  const adapter = suppliedDevice ? null : await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
  if (!suppliedDevice && !adapter) throw new Error('No WebGPU adapter is available');
  const device = suppliedDevice || await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) { if (!suppliedDevice) device.destroy(); throw new Error('WebGPU canvas is unavailable'); }
  const format = navigator.gpu.getPreferredCanvasFormat();
  const resources = new Set();
  let frame = null, destroyed = false, busy = false, fatal = null;
  const own = resource => { resources.add(resource); return resource; };
  const release = resource => { resources.delete(resource); resource.destroy(); };
  const buffer = (size, usage, data) => {
    const result = own(device.createBuffer({size: Math.max(4, size), usage, mappedAtCreation: !!data}));
    if (data) { new Uint8Array(result.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); result.unmap(); }
    return result;
  };
  const check = () => { if (destroyed) throw new Error('AI renderer has been destroyed'); if (fatal) throw fatal; };
  const disposeFrame = () => {
    if (!frame) return;
    for (const resource of frame.resources) release(resource);
    frame = null;
  };
  const fail = error => {
    if (fatal || destroyed) return;
    fatal = error instanceof Error ? error : new Error(String(error));
    for (const resource of resources) resource.destroy();
    resources.clear();
    frame = null;
    context.unconfigure();
    if (!suppliedDevice) device.destroy();
  };
  const uncaptured = event => fail(new Error(`WebGPU: ${event.error.message}`));
  device.addEventListener('uncapturederror', uncaptured);
  device.lost.then(info => { if (!destroyed) fail(new Error(`WebGPU device lost: ${info.message || info.reason}`)); });
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    device.removeEventListener('uncapturederror', uncaptured);
    context.unconfigure();
    for (const resource of resources) resource.destroy();
    resources.clear();
    frame = null;
    if (!suppliedDevice) device.destroy();
  };

  try {
    // Bounded per-tile activations; no full-frame 32-channel feature maps.
    tileSize = Math.min(tileSize, 256);
    while ((tileSize + 2 * HALO) ** 2 * 32 * 4 > device.limits.maxStorageBufferBindingSize ||
           Math.ceil((tileSize + 2 * HALO) ** 2 * 32 / THREADS) > device.limits.maxComputeWorkgroupsPerDimension) tileSize--;
    if (tileSize < 1) throw new Error('WebGPU storage limits are too small');
    const extent = tileSize + 2 * HALO;
    const compute = async code => {
      const module = device.createShaderModule({code});
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter(message => message.type === 'error');
      if (errors.length) throw new Error(errors.map(message => `${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
      return device.createComputePipelineAsync({layout: 'auto', compute: {module, entryPoint: 'main'}});
    };
    const [initialize, layers] = await Promise.all([
      compute(INITIALIZE),
      Promise.all(model.layers.map((layer, i) => compute(convolutionShader(layer, i === 4)))),
    ]);
    const module = device.createShaderModule({code: outputShader(model.scale, model.outputBias)});
    const render = await device.createRenderPipelineAsync({layout: 'auto', vertex: {module, entryPoint: 'vertex'}, fragment: {module, entryPoint: 'fragment', targets: [{format}]}, primitive: {topology: 'triangle-list'}});
    const learned = model.layers.map(layer => {
      const data = new Float32Array([...layer.weights, ...(layer.bias || []), ...(layer.alpha || [])]);
      return buffer(data.byteLength, BU.STORAGE, data);
    });
    const activations = [buffer(extent * extent * 32 * 4, BU.STORAGE), buffer(extent * extent * 32 * 4, BU.STORAGE)];
    const sampler = device.createSampler({magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'});
    const group = (pipeline, entries) => device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: entries.map((resource, binding) => ({binding, resource: resource?.size !== undefined ? {buffer: resource} : resource}))});
    const configure = (width, height) => {
      check();
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
          width * model.scale > device.limits.maxTextureDimension2D || height * model.scale > device.limits.maxTextureDimension2D) throw new Error('Unsupported decoded frame dimensions');
      if (frame?.width === width && frame?.height === height) return;
      disposeFrame();
      const image = own(device.createTexture({size: [width, height], format: 'rgba8unorm', usage: TU.TEXTURE_BINDING | TU.COPY_DST | TU.RENDER_ATTACHMENT}));
      const owned = [image], tiles = [];
      try {
        for (let y = 0; y < height; y += tileSize) for (let x = 0; x < width; x += tileSize) {
          const data = new Int32Array([x - HALO, y - HALO, width, height, extent, extent, 0, 0]);
          const params = buffer(32, BU.UNIFORM, data);
          owned.push(params);
          tiles.push({x, y, params,
            init: group(initialize, [image.createView(), activations[0], params]),
            layers: layers.map((pipeline, i) => group(pipeline, [activations[i % 2], activations[(i + 1) % 2], learned[i], params])),
            render: group(render, [image.createView(), sampler, activations[1], params]),
          });
        }
        canvas.width = width * model.scale;
        canvas.height = height * model.scale;
        context.configure({device, format, alphaMode: 'opaque'});
        frame = {width, height, image, tiles, resources: owned};
      } catch (error) { for (const resource of owned) release(resource); throw error; }
    };
    const dispatch = (encoder, pipeline, bindGroup, count) => {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(count / THREADS)); pass.end();
    };
    const convolve = (encoder, tile) => {
      for (let i = 0; i < layers.length; i++) dispatch(encoder, layers[i], tile.layers[i], extent * extent * model.layers[i].outChannels);
    };
    const run = async operation => {
      check();
      if (busy) throw new Error('An AI frame is already in flight');
      busy = true;
      try { return await operation(); }
      finally { busy = false; }
    };
    check();
    return {
      processFrame: source => run(async () => {
        const width = source.videoWidth || source.width, height = source.videoHeight || source.height;
        if ('readyState' in source && source.readyState < 2) throw new Error('No decoded video frame is available');
        configure(width, height);
        device.queue.copyExternalImageToTexture({source}, {texture: frame.image, colorSpace: 'srgb', premultipliedAlpha: false}, [width, height]);
        const encoder = device.createCommandEncoder(), output = context.getCurrentTexture().createView();
        for (let i = 0; i < frame.tiles.length; i++) {
          const tile = frame.tiles[i];
          dispatch(encoder, initialize, tile.init, extent * extent);
          convolve(encoder, tile);
          const pass = encoder.beginRenderPass({colorAttachments: [{view: output, loadOp: i ? 'load' : 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 1}}]});
          pass.setPipeline(render); pass.setBindGroup(0, tile.render);
          pass.setScissorRect(tile.x * model.scale, tile.y * model.scale, Math.min(tileSize, width - tile.x) * model.scale, Math.min(tileSize, height - tile.y) * model.scale);
          pass.draw(3); pass.end();
        }
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        check();
        return {width: canvas.width, height: canvas.height};
      }),
      lost: device.lost,
      destroy,
    };
  } catch (error) { destroy(); throw error; }
}
