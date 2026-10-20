// Deliberately straightforward CPU oracle: no production shader/source reuse.
// Tensors are channels-last and weights are [kernelY, kernelX, input, output].
export function referenceLuma(model, input, width, height) {
  let values = Float32Array.from(input);
  for (const layer of model.layers) {
    const next = new Float32Array(width * height * layer.outChannels);
    const radius = (layer.kernelSize - 1) / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let output = 0; output < layer.outChannels; output++) {
          let value = layer.bias?.[output] ?? 0;
          for (let ky = 0; ky < layer.kernelSize; ky++) {
            const sourceY = y + ky - radius;
            if (sourceY < 0 || sourceY >= height) continue;
            for (let kx = 0; kx < layer.kernelSize; kx++) {
              const sourceX = x + kx - radius;
              if (sourceX < 0 || sourceX >= width) continue;
              for (let channel = 0; channel < layer.inChannels; channel++) {
                const sourceIndex = (sourceY * width + sourceX) * layer.inChannels + channel;
                const weightIndex = ((ky * layer.kernelSize + kx) * layer.inChannels + channel) * layer.outChannels + output;
                value += values[sourceIndex] * layer.weights[weightIndex];
              }
            }
          }
          if (layer.alpha && value < 0) value *= layer.alpha[output];
          next[(y * width + x) * layer.outChannels + output] = value;
        }
      }
    }
    values = next;
  }
  const scale = model.scale;
  const outputWidth = width * scale;
  const output = new Float32Array(outputWidth * height * scale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const channel = dy * scale + dx;
          output[(y * scale + dy) * outputWidth + x * scale + dx] =
            values[(y * width + x) * scale * scale + channel] + model.outputBias;
        }
      }
    }
  }
  return output;
}

// A reproducible complete network with every stage, signed values and biases,
// and PReLU coefficients both below zero and above one. This is a test fixture,
// not trained super-resolution weights.
export function deterministicModel(scale) {
  const shapes = [[5, 1, 32], [1, 32, 5], [3, 5, 5], [1, 5, 32], [1, 32, scale * scale]];
  return {
    schemaVersion: 1,
    name: 'FSRCNN-small',
    scale,
    halo: 3,
    outputBias: 0.31,
    layers: shapes.map(([kernelSize, inChannels, outChannels], index) => ({
      kernelSize,
      inChannels,
      outChannels,
      weights: Array.from({length: kernelSize * kernelSize * inChannels * outChannels}, (_, i) =>
        Math.sin((i + 1) * (index + 2) * 0.47) * 0.6 / Math.sqrt(kernelSize * kernelSize * inChannels)),
      bias: index === 4 ? null : Array.from({length: outChannels}, (_, i) => (i % 3 - 1) * 0.037),
      alpha: index === 4 ? null : Array.from({length: outChannels}, (_, i) => [-0.2, 0.15, 1.4, 0.6][(i + index) % 4]),
    })),
  };
}
