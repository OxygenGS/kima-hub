# v1.11 — UPF/MTG MusiCNN licensing inquiry (prepared, NOT SENT)

**Status: inquiry ready for a human sender, no rights-holder response or license grant recorded.** Reviewed 19 October 2026. This is a practical prepared communication for the release owner; it does not authorize publishing or removing content. The rightsholder's [official licensing page](https://essentia.upf.edu/licensing_information.html) identifies the contact **mtg-info@upf.edu** and describes **CC BY-NC-ND 4.0** model licensing. Its [models overview](https://essentia.upf.edu/models.html) instead names **CC BY-NC-SA 4.0**. We must not choose one interpretation ourselves.

## Exact question and attachment inventory

The fork [OxygenGS/kima-hub](https://github.com/OxygenGS/kima-hub) contains a **one-to-one set of 11 original `.pb` and 11 converted `.onnx` models**:

| Original (repository: `services/audio-analyzer/pb/`) | Converted distributed file (repository: `services/audio-analyzer/models/`) |
| --- | --- |
| `msd-musicnn-1.pb` | `msd-musicnn-1.onnx` |
| `danceability-msd-musicnn-1.pb` | `danceability-msd-musicnn-1.onnx` |
| `deam-msd-musicnn-2.pb` | `deam-msd-musicnn-2.onnx` |
| `emomusic-msd-musicnn-2.pb` | `emomusic-msd-musicnn-2.onnx` |
| `mood_acoustic-msd-musicnn-1.pb` | `mood_acoustic-msd-musicnn-1.onnx` |
| `mood_aggressive-msd-musicnn-1.pb` | `mood_aggressive-msd-musicnn-1.onnx` |
| `mood_electronic-msd-musicnn-1.pb` | `mood_electronic-msd-musicnn-1.onnx` |
| `mood_happy-msd-musicnn-1.pb` | `mood_happy-msd-musicnn-1.onnx` |
| `mood_party-msd-musicnn-1.pb` | `mood_party-msd-musicnn-1.onnx` |
| `mood_relaxed-msd-musicnn-1.pb` | `mood_relaxed-msd-musicnn-1.onnx` |
| `mood_sad-msd-musicnn-1.pb` | `mood_sad-msd-musicnn-1.onnx` |

The fork uses `services/audio-analyzer/convert_musicnn.py` for ONNX conversion and ships the ONNX artifacts with the publicly downloadable Docker image. Its original `services/audio-analyzer/pb/LICENSE-upf-models` notice names **CC BY-NC-ND 4.0** but links to a **CC BY-NC-SA 4.0 legalcode** URL in the introductory text, while UPF's other model documentation also refers to BY-NC-SA. The Dockerfile copies `services/audio-analyzer/models/` into `/app/models/` and does **not** copy the `pb/LICENSE-upf-models` file into the image with those ONNX files.

## Ready-to-send request (requires manual sending)

**To:** mtg-info@upf.edu  
**Subject:** License clarification — redistribution of converted MusiCNN models in open-source Kima Hub Docker image

Dear Music Technology Group / Universitat Pompeu Fabra,

We maintain an independently developed open-source fork of Kima Hub and use the 11 Essentia MusiCNN-based model files listed above for music audio analysis. We distribute matching ONNX-format conversions of the original TensorFlow `.pb` graphs, including the model weights, as part of a publicly available Docker image.

We are reviewing our obligations before a new stable release and would appreciate your written clarification on the following points:

1. Which **specific license and version** governs these eleven source model files? The supplied license notice calls them CC BY-NC-ND 4.0, but links to a BY-NC-SA legalcode URL; the official Essentia models page also describes BY-NC-SA 4.0. Which grant controls these exact older MusiCNN models?
2. Does that license permit **converting the original graphs and weights to ONNX and publicly distributing those converted files** in a GPLv3 application/Docker image? Is any additional consent needed because of the NoDerivatives clause?
3. What conditions apply to **free, open-source public distribution, self-hosting and possible commercial use by downstream users**, even when the software itself is distributed without charge?
4. Which **copyright attribution, full legal text, corresponding source/weights notices, conversion provenance or additional files** must be included inside the Docker image and public source repository?
5. If existing terms do not allow this, can you specify the **required alternative license or written permission** and the appropriate process for obtaining it?

The original and converted files are published at: https://github.com/OxygenGS/kima-hub/tree/feature/upstream-v111-implementation/services/audio-analyzer

We will preserve the current model provenance and will not assume permission based solely on public availability or a copy of a license notice. Thank you for helping us comply with your intended terms.

Best regards,  
The OxygenGS Kima Hub maintainers

## Decision / follow-up

- [ ] Release owner sends the inquiry externally; record sending date/recipient and preserve response
- [ ] Rights holder identifies applicable license for **these 11 models**, conversion and binary redistribution
- [ ] Appropriate reviewer decides whether source/image distribution is compliant and documents full requirements
- [ ] If permitted, add mandated notices into a **new** candidate, rerun CI, publish only after permission and independently reverify
- [ ] If not permitted, plan an alternative model/runtime path without silently breaking mood, danceability and analysis features
- [ ] Assess already-published rc3 and agree any required remedial handling with the rights owner

**No reply has been received as part of this task.** Neither the existing candidate nor any private installation has been modified by preparing this document.
