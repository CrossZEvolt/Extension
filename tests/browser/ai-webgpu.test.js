import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {deterministicModel, referenceLuma} from '../helpers/ai-reference.js';

let server, browser, page;
before(async () => {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
    if (path === '/') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><canvas id="output"></canvas>'); return; }
    try { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(resolve(path.slice(1)))); }
    catch { response.statusCode = 404; response.end('Missing module'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/lib/chromium/chromium', headless: true,
    args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader']});
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

for (const scale of [2, 3]) test(`canvas x${scale} renders native decoded dimensions using learned full-range luma and bilinear chroma`, async () => {
  const model = deterministicModel(scale), width = 7, height = 5;
  const rgba = Array.from({length: width * height * 4}, (_, i) => i % 4 === 3 ? 255 : (i * 71 + 43) % 256);
  const input = Float32Array.from({length: width * height}, (_, i) => (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255);
  const expectedLuma = referenceLuma(model, input, width, height);
  const result = await page.evaluate(async ({model, rgba, width, height}) => {
    const {createWebGpuUpscaler} = await import('/src/scripts/features/ai/webgpu.js');
    const canvas = document.createElement('canvas'), source = document.createElement('canvas');
    source.width = width; source.height = height;
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const upscaler = await createWebGpuUpscaler({canvas, model, tileSize: 2});
    try {
      const shape = await upscaler.processFrame(source);
      const read = document.createElement('canvas'); read.width = canvas.width; read.height = canvas.height;
      read.getContext('2d').drawImage(canvas, 0, 0);
      const pixels = Array.from(read.getContext('2d').getImageData(0, 0, read.width, read.height).data);
      // Resizing reuses the same bounded renderer and changes decoded dimensions.
      source.width = 3; source.height = 2;
      const resized = await upscaler.processFrame(source);
      upscaler.destroy(); upscaler.destroy();
      let destroyedError;
      try { await upscaler.processFrame(source); } catch (error) { destroyedError = error.message; }
      return {shape, pixels, resized, destroyedError};
    } finally { upscaler.destroy(); }
  }, {model, rgba, width, height});
  assert.deepEqual(result.shape, {width: width * scale, height: height * scale});
  assert.deepEqual(result.resized, {width: 3 * scale, height: 2 * scale});
  assert.match(result.destroyedError, /destroyed/);
  let maxError = 0;
  for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
    const fx = (x + 0.5) / scale - 0.5, fy = (y + 0.5) / scale - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const pixel = (px, py, channel) => rgba[(Math.max(0, Math.min(height - 1, py)) * width + Math.max(0, Math.min(width - 1, px))) * 4 + channel] / 255;
    const rgb = [0, 1, 2].map(channel => (pixel(x0, y0, channel) * (1 - tx) + pixel(x0 + 1, y0, channel) * tx) * (1 - ty) + (pixel(x0, y0 + 1, channel) * (1 - tx) + pixel(x0 + 1, y0 + 1, channel) * tx) * ty);
    const delta = Math.max(0, Math.min(1, expectedLuma[y * width * scale + x])) - (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114);
    for (let channel = 0; channel < 3; channel++) {
      const expected = Math.round(Math.max(0, Math.min(1, rgb[channel] + delta)) * 255);
      maxError = Math.max(maxError, Math.abs(expected - result.pixels[(y * width * scale + x) * 4 + channel]));
    }
    assert.equal(result.pixels[(y * width * scale + x) * 4 + 3], 255);
  }
  assert.ok(maxError <= 2, `rendered RGB maximum channel error ${maxError}`);
  console.log(`x${scale} canvas: ${result.shape.width}x${result.shape.height}, maximum channel error ${maxError}/255`);
});

test('WebGPU reports device loss and rejects overlapping frames and malformed model data', async () => {
  const result = await page.evaluate(async model => {
    const {createWebGpuUpscaler} = await import('/src/scripts/features/ai/webgpu.js');
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
    const canvas = document.createElement('canvas'), source = document.createElement('canvas');
    source.width = 2; source.height = 2; source.getContext('2d').fillRect(0, 0, 2, 2);
    const upscaler = await createWebGpuUpscaler({canvas, model, device});
    const first = upscaler.processFrame(source);
    let overlap;
    try { await upscaler.processFrame(source); } catch (error) { overlap = error.message; }
    await first;
    device.destroy(); await device.lost;
    let lost;
    try { await upscaler.processFrame(source); } catch (error) { lost = error.message; }
    upscaler.destroy();
    let invalid;
    model.layers[0].weights[0] = NaN;
    try { await createWebGpuUpscaler({canvas: document.createElement('canvas'), model}); } catch (error) { invalid = error.message; }
    return {overlap, lost, invalid};
  }, deterministicModel(2));
  assert.match(result.overlap, /already in flight/);
  assert.match(result.lost, /device lost/);
  assert.match(result.invalid, /Invalid FSRCNN-small layer/);
});

for (const scale of [2, 3]) test(`bundled pretrained x${scale} renders learned pixels at frame edges and tile seams`, async () => {
  const model = JSON.parse(await readFile(`src/models/fsrcnn-small-x${scale}.json`, 'utf8'));
  const width = 9, height = 7;
  const input = Float32Array.from({length: width * height}, (_, i) => Math.round(((i % width < 4 ? 0.1 : 0.85) + 0.05 * Math.sin(i)) * 255) / 255);
  const expected = referenceLuma(model, input, width, height);
  const actual = await page.evaluate(async ({model, input, width, height}) => {
    const {createWebGpuUpscaler} = await import('/src/scripts/features/ai/webgpu.js');
    const canvas = document.createElement('canvas'), source = document.createElement('canvas');
    source.width = width; source.height = height;
    const rgba = Uint8ClampedArray.from({length: width * height * 4}, (_, i) => i % 4 === 3 ? 255 : Math.round(input[Math.floor(i / 4)] * 255));
    source.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
    const upscaler = await createWebGpuUpscaler({canvas, model, tileSize: 3});
    try {
      await upscaler.processFrame(source);
      const read = document.createElement('canvas'); read.width = canvas.width; read.height = canvas.height;
      read.getContext('2d').drawImage(canvas, 0, 0);
      const pixels = read.getContext('2d').getImageData(0, 0, read.width, read.height).data;
      return Array.from({length: read.width * read.height}, (_, i) => pixels[i * 4]);
    } finally { upscaler.destroy(); }
  }, {model, input: Array.from(input), width, height});
  const maxError = Math.max(...actual.map((value, i) => Math.abs(value - Math.round(Math.max(0, Math.min(1, expected[i])) * 255))));
  assert.ok(maxError <= 1, `pretrained GPU/CPU maximum byte error ${maxError}`);
  let learnedDifference = 0;
  const sample = (x, y) => input[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
    const fx = (x + 0.5) / scale - 0.5, fy = (y + 0.5) / scale - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const bilinear = (sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx) * (1 - ty) + (sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx) * ty;
    learnedDifference = Math.max(learnedDifference, Math.abs(actual[y * width * scale + x] / 255 - bilinear));
  }
  assert.ok(learnedDifference > 0.01, 'pretrained learned pixels differ from bilinear interpolation');
  console.log(`pretrained x${scale}: ${actual.length} canvas pixels, max GPU/CPU byte error ${maxError}, max bilinear difference ${learnedDifference}`);
});

test('video frames use decoded videoWidth/videoHeight and reject an undecoded source', async () => {
  const result = await page.evaluate(async model => {
    const {createWebGpuUpscaler} = await import('/src/scripts/features/ai/webgpu.js');
    const canvas = document.createElement('canvas'), video = document.createElement('video');
    const upscaler = await createWebGpuUpscaler({canvas, model, tileSize: 2});
    let empty;
    try { await upscaler.processFrame(video); } catch (error) { empty = error.message; }
    const source = document.createElement('canvas'); source.width = 4; source.height = 3;
    source.getContext('2d').fillStyle = '#888'; source.getContext('2d').fillRect(0, 0, 4, 3);
    const stream = source.captureStream(10);
    try {
      video.muted = true; video.srcObject = stream;
      video.width = 1920; video.height = 1080;
      await video.play();
      const output = await upscaler.processFrame(video);
      return {empty, decodedWidth: video.videoWidth, decodedHeight: video.videoHeight, output, hasLostSignal: upscaler.lost instanceof Promise};
    } finally { video.pause(); for (const track of stream.getTracks()) track.stop(); video.srcObject = null; upscaler.destroy(); }
  }, deterministicModel(2));
  assert.match(result.empty, /No decoded video frame/);
  assert.equal(result.decodedWidth, 4);
  assert.equal(result.decodedHeight, 3);
  assert.deepEqual(result.output, {width: 8, height: 6});
  assert.equal(result.hasLostSignal, true);
});

test('an attached canvas visibly presents learned pixels after its drawing buffer is composited', async () => {
  const model = JSON.parse(await readFile('src/models/fsrcnn-small-x3.json', 'utf8'));
  const width = 9, height = 7, scale = model.scale;
  const input = Float32Array.from({length: width * height}, (_, i) => Math.round((i % width < 4 ? 0.2 : 0.8) * 255) / 255);
  const expected = referenceLuma(model, input, width, height);
  await page.evaluate(async ({model, input, width, height}) => {
    const {createWebGpuUpscaler} = await import('/src/scripts/features/ai/webgpu.js');
    const canvas = document.createElement('canvas'), source = document.createElement('canvas');
    document.body.replaceChildren(canvas);
    document.body.style.cssText = 'margin:0;background:magenta';
    canvas.style.cssText = 'position:absolute;left:0;top:0';
    source.width = width; source.height = height;
    const rgba = Uint8ClampedArray.from({length: width * height * 4}, (_, i) => i % 4 === 3 ? 255 : Math.round(input[Math.floor(i / 4)] * 255));
    source.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
    window.__attachedAiRenderer = await createWebGpuUpscaler({canvas, model, tileSize: 3});
    await window.__attachedAiRenderer.processFrame(source);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, {model, input: Array.from(input), width, height});
  try {
    // Attached WebGPU canvases can expose an expired/empty drawing buffer to
    // drawImage after compositing. Inspect the browser's actual presented pixels.
    const screenshot = await page.screenshot({clip: {x: 0, y: 0, width: width * scale, height: height * scale}});
    const pixels = await page.evaluate(async bytes => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], {type: 'image/png'}));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
      return Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    }, Array.from(screenshot));
    let maxError = 0;
    for (let i = 0; i < expected.length; i++) {
      const value = Math.round(Math.max(0, Math.min(1, expected[i])) * 255);
      for (let channel = 0; channel < 3; channel++) maxError = Math.max(maxError, Math.abs(pixels[i * 4 + channel] - value));
      assert.equal(pixels[i * 4 + 3], 255);
    }
    assert.ok(maxError <= 1, `presented learned pixel maximum error ${maxError}/255`);
  } finally {
    await page.evaluate(() => { window.__attachedAiRenderer.destroy(); delete window.__attachedAiRenderer; document.body.replaceChildren(); });
  }
});
