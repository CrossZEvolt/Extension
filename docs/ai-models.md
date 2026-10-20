# Local AI model assets

The extension bundles independently trained **FSRCNN-small x2 and x3** models.
They infer higher-resolution luminance detail for each decoded frame.
The models do not select a higher-resolution YouTube stream or recover the
original detail lost through compression. A 1080p frame uses x2; a 720p frame
uses x3 to reach 3840×2160 when its source aspect ratio is 16:9.

## Provenance and license

Source repository: <https://github.com/Saafke/FSRCNN_Tensorflow>.
Pinned commit: `6a4812c4ef1c4f5947d79beafa32a05a6eb4a94d`.
The repository README includes these pretrained TensorFlow models and reports
training on T91 followed by fine-tuning on General100. It implements FSRCNN
with a sub-pixel output layer in place of the original transpose convolution.

| Source file | Bytes | SHA-256 |
| --- | ---: | --- |
| `models/FSRCNN-small_x2.pb` | 9595 | `429e4793d049c1ae16ddbbc322fd11c3c08831c0c20137390b4d098976a2b0d9` |
| `models/FSRCNN-small_x3.pb` | 10235 | `58e72d0c4231b8e754180e787d7348f45ae6230ee3c5af7dc12b558467f593f7` |
| `LICENSE` | 11357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |

The upstream repository uses Apache-2.0 and contains no separate model license.
[LICENSE-FSRCNN.txt](../src/models/LICENSE-FSRCNN.txt) is an exact copy of its
license. The JSON assets are converted representations of the upstream weights;
they have not been retrained, quantized, or rounded. Their `source` fields record
the repository, commit, original file, and checksum. Keep these notices and the
license with redistributed assets.

## Reproduce and audit the conversion

The converter requires Python 3.8 or newer and uses only its standard library.
It reads local files, performs no downloads, and does not require TensorFlow,
ONNX Runtime, NumPy, or a GPU. Obtain the pinned source separately:

```sh
git clone https://github.com/Saafke/FSRCNN_Tensorflow.git /tmp/crossz-fsrcnn-reference
git -C /tmp/crossz-fsrcnn-reference checkout --detach 6a4812c4ef1c4f5947d79beafa32a05a6eb4a94d
python3 tools/convert-ai-models.py --source-dir /tmp/crossz-fsrcnn-reference
python3 tools/convert-ai-models.py --source-dir /tmp/crossz-fsrcnn-reference --check
```

The first converter command writes the two JSON files and license to `src/models`.
The second compares all three outputs byte for byte without writing. An optional
`--output-dir` supports independent regeneration in a temporary directory.

Before writing any asset, the converter verifies all three source SHA-256 hashes,
parses their protobuf data, and validates the exact five-convolution small-model
graphs. It checks tensor dimensions and counts, finite float32 parameters,
NHWC layout, unit strides and dilations, SAME padding, complete PReLU wiring,
scale-specific DepthToSpace, shared output bias, and output transpose. Extra
nodes, graph functions, unsupported operations, and the full FSRCNN models are
rejected. JSON numbers retain the complete parsed float32 values using Python's
round-trip decimal representation. Output ordering and separators are fixed.

## Runtime contract

Each JSON object has `schemaVersion: 1`, `name: "FSRCNN-small"`, `scale`,
`halo: 3`, five `layers`, `outputBias`, `source`, and `license: "Apache-2.0"`.
Every layer stores `kernelSize`, `inChannels`, `outChannels`, a flat `weights`
array, `bias`, and `alpha`. The layer dimensions are:

| Layer | Kernel | Channels |
| --- | --- | --- |
| Feature extraction | 5×5 | 1 → 32 |
| Shrinking | 1×1 | 32 → 5 |
| Mapping | 3×3 | 5 → 5 |
| Expanding | 1×1 | 5 → 32 |
| Sub-pixel output | 1×1 | 32 → scale² |

Activations use NHWC ordering. Filters use TensorFlow HWIO ordering:
`(((ky * kernelSize + kx) * inChannels + inputChannel) * outChannels + outputChannel)`.
Convolution is cross-correlation: do not reverse the filter. The first four
layers add their per-channel bias and apply PReLU,
`max(x, 0) + alpha[channel] * min(x, 0)`. Learned alpha values may be negative
or exceed one; preserve them. The final layer has `bias: null` and `alpha: null`.
Its scale² channels undergo NHWC DepthToSpace, with phase index `dy * scale + dx`:
input channel `(dy, dx)` becomes output position `(y * scale + dy, x * scale + dx)`.
Add the shared scalar `outputBias` after that shuffle. The independently trained
x2 and x3 models must each use their own complete set of weights.

All convolutions use stride one and SAME zero padding. The small model's input
receptive field is 7×7, so a tiled implementation needs a three-input-pixel halo.
At true frame boundaries, every layer independently treats missing input
activations as zero. Running the biased network over an invented outer padding
region produces different boundary values. Crop tile overlap and respect the
global frame bounds at every layer.

## Color and output

Upstream inference converts decoded BGR images with OpenCV's `BGR2YCrCb`, takes
the Y channel, and divides its byte value by 255. For browser RGB input this is
full-range, gamma-encoded BT.601 luminance:
`Y = 0.299 * R + 0.587 * G + 0.114 * B` for channels normalized to `[0, 1]`.
Do not apply limited-range video offsets, BT.709 coefficients, or a linear-light
transfer before this network. The model is intended for SDR image values.

After inference, add the output bias and clamp predicted Y to `[0, 1]`. Upstream
converts Y back to byte values, enlarges original Cr and Cb with bicubic
interpolation, and converts YCrCb back to BGR. Browser rendering must preserve
the original chroma when replacing luminance; the network does not infer color.

## Quality and performance limits

These are small spatial image models, trained on bicubic-downsampled still
images. YouTube compression, text, motion, and noise can behave differently.
They have no temporal state or motion compensation, so detail can flicker
between frames. Added sharpness is inferred detail and may contain artifacts;
an output canvas measuring 3840×2160 does not establish native 4K source quality.

Small model files still require substantial processing. Convolutions alone cost
about 1.50 billion multiply-accumulates per 720p x3 frame and 3.05 billion per
1080p x2 frame. One full-size 32-channel float32 intermediate occupies about
112.5 MiB or 253.1 MiB respectively. Tiling, bounded queues, and GPU-resident
intermediates matter. Full playback frame rate depends on the browser, GPU,
decoder, implementation, and Ambient workload; these assets do not establish a
frame-rate guarantee or HDR/protected-video support.
