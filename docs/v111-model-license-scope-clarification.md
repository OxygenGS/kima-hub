# v1.11 model rights: applicable license versus separate permission

Reviewed 19 October 2026; updated after checking the **official upstream Kima v1.11.0 tag against the current OxygenGS PR #7 source**. This corrects an overbroad release requirement; it is not a license grant, binding legal opinion or stable-release approval.

## Correction to the earlier wording

The previous packet repeatedly said that a separate written UPF permission was required even for unmodified official ONNX files. That is too absolute as a general legal statement. A public license can itself grant distribution rights when it applies to the exact material and the distributor complies with its conditions. A private reply is one way to resolve uncertainty, not an automatic additional requirement imposed by every Creative Commons license.

The [CC BY-NC-ND 4.0 legal code](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en), section 2(a)(1), grants reproduction and sharing of licensed material for noncommercial purposes, subject to its conditions. Section 3 requires attribution and retention of specified notices. Section 2(a)(4) also permits necessary technical format modifications and says modifications covered by that provision do not create Adapted Material. Therefore, neither an ONNX filename nor a byte difference alone proves an impermissible derivative. Whether our complete conversion process falls within that provision needs assessment; numerical equivalence is not a legal determination.

## Verified upstream parity: no fork-specific model conversion

At upstream tag [Chevron7Locked/kima-hub v1.11.0](https://github.com/Chevron7Locked/kima-hub/tree/v1.11.0/services/audio-analyzer) and OxygenGS Draft PR #7 source `4c26b502537092da764791e83266f7b1a2d0ab61`, the Git blob hashes of **all eleven** `services/audio-analyzer/models/*.onnx` files match exactly. All eleven original `pb/*.pb` files match, as do `models/MANIFEST.sha256`, the original UPF license file, `convert_musicnn.py`, `musicnn_onnx.py`, and `analyzer.py`. Upstream v1.11.0 itself copies `services/audio-analyzer/models/` into `/app/models` in its root Dockerfile. OxygenGS has not independently modified or reconverted these graphs in the combined v1.11 source.

The fork's current source adds the **unchanged** original UPF notice in the shipped models directory and a provenance notice. The already-published OxygenGS rc3 predates that packaging fix; source improvements do not change rc3 retrospectively. The separate technically tested official-UPF-ONNX substitution is **not** part of this parity claim, current source or rc3.

The earlier theory that OxygenGS must request new special ONNX *conversion* permission **because this fork converted models differently from upstream is factually wrong**. There is no unique fork conversion. The underlying rightsholder terms apply to **both** upstream and fork, and upstream publication alone is not a license grant. It does mean a mandatory fork-specific email was not justified. The route is to document and comply with the applicable existing public Creative Commons grant for the chosen scope, with rightsholder correspondence an optional escalation if applicable rights remain uncertain or commercial rights are sought.

## What remains uncertain in this release

The rightsholder's currently accessible pages are inconsistent:

- [Essentia licensing information](https://essentia.upf.edu/licensing_information.html) describes the models as CC BY-NC-ND 4.0 and offers a proprietary licensing route.
- [Essentia model overview](https://essentia.upf.edu/models.html) describes MTG-created models as CC BY-NC-SA 4.0, including a model repository containing alternative formats.

The inherited original notice itself names BY-NC-ND while linking to BY-NC-SA; the exact 11-file inventory and this conflict are documented in [the rights review](v111-third-party-model-rights-review.md). The already-published rc3 uses the **same upstream v1.11.0 converted ONNX model blobs** but lacks the UPF notice alongside `/app/models`. Current Draft #7 source fixes that notice packaging; it does not retroactively change rc3. No original notice has been rewritten or relicensed.

## Evidence that can close the model-distribution gate

The maintainer's recorded licensing review must identify the exact files, applicable grant, permitted distribution/use scope and required notices. It may rely on either:

1. A sufficiently clear, applicable **existing public license**, with documented compliance for the selected model files and intended distribution; or
2. **Written rightsholder clarification or an additional license** where applicability, conversion, commercial use or other rights cannot be resolved from the existing grant.

A GPL license for application code must not be represented as overriding different model terms. Noncommercial scope must be described accurately; merely charging no download fee is not a complete determination of that scope. Any official-file replacement must retain model provenance/hashes and receive its own integrated source/image tests and notices before publication.

The [prepared UPF inquiry](v111-upf-model-license-inquiry.md) is an **optional clarification route**, not a mandatory prerequisite or an instruction that the fork owner must email MTG. The fork shares the exact upstream model blobs; public Creative Commons rights may be enough for noncommercial redistribution if the chosen grant and its requirements apply and are documented. The unresolved discrepancy must not be disguised as unrestricted commercial permission. No email has been sent.

## Release status

**The rights gate is still unresolved, but it is not categorically dependent on receiving a new private permission letter.** This clarification does not approve the current image, silently change its model files, settle commercial permissions, or waive any security, recovery, user-acceptance or publication decision. The required outcome is documented applicable rights and compliance, not correspondence for its own sake.
