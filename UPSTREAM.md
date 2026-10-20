# Ambient source

WesselKroos/youtube-ambilight, develop commit `18d17188e5562e5ee913f005192d30c9a60be078`, MIT.

Preserves the Ambient renderer and settings keys/values; adds CrossZ modules. From 0.1.2, the settings interface uses a CrossZ Light Studio design and Vietnamese presentation labels, retaining the MIT attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Network crash reporting and original branding/donations removed.

From 0.2.0, bundled FSRCNN-small x2/x3 weights come from [Saafke/FSRCNN_Tensorflow](https://github.com/Saafke/FSRCNN_Tensorflow), commit `6a4812c4ef1c4f5947d79beafa32a05a6eb4a94d`, Apache-2.0. The WebGPU runtime is implemented in this repository. Source hashes, conversion details and runtime differences are documented in [docs/ai-models.md](docs/ai-models.md); the upstream model license is preserved separately in `src/models/LICENSE-FSRCNN.txt`.
