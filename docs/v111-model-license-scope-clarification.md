# v1.11 model rights: applicable license versus separate permission

Reviewed 19 October 2026. This corrects an overbroad statement in earlier release notes; it is not a license grant, a binding legal opinion, or stable-release approval.

## Correction to the earlier wording

The previous packet repeatedly said that a separate written UPF permission was required even for unmodified official ONNX files. That is too absolute as a general legal statement. A public license can itself grant distribution rights when it applies to the exact material and the distributor complies with its conditions. A private reply is one way to resolve uncertainty, not an automatic additional requirement imposed by every Creative Commons license.

The [CC BY-NC-ND 4.0 legal code](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en), section 2(a)(1), grants reproduction and sharing of licensed material for noncommercial purposes, subject to its conditions. Section 3 requires attribution and retention of specified notices. Section 2(a)(4) also permits necessary technical format modifications and says modifications covered by that provision do not create Adapted Material. Therefore, neither an ONNX filename nor a byte difference alone proves an impermissible derivative. Whether our complete conversion process falls within that provision needs assessment; numerical equivalence is not a legal determination.

## What remains uncertain in this release

The rightsholder's currently accessible pages are inconsistent:

- [Essentia licensing information](https://essentia.upf.edu/licensing_information.html) describes the models as CC BY-NC-ND 4.0 and offers a proprietary licensing route.
- [Essentia model overview](https://essentia.upf.edu/models.html) describes MTG-created models as CC BY-NC-SA 4.0, including a model repository containing alternative formats.

The existing repository notice mismatch and the exact 11-file inventory remain documented in [the rights review](v111-third-party-model-rights-review.md). The current rc3 still contains independently converted model files, not the temporary first-party ONNX substitution. Its missing model notice alongside `/app/models` remains an identified packaging issue. No original notice has been rewritten or relicensed here.

## Evidence that can close the model-distribution gate

The maintainer's recorded licensing review must identify the exact files, applicable grant, permitted distribution/use scope and required notices. It may rely on either:

1. A sufficiently clear, applicable **existing public license**, with documented compliance for the selected model files and intended distribution; or
2. **Written rightsholder clarification or an additional license** where applicability, conversion, commercial use or other rights cannot be resolved from the existing grant.

A GPL license for application code must not be represented as overriding different model terms. Noncommercial scope must be described accurately; merely charging no download fee is not a complete determination of that scope. Any official-file replacement must retain model provenance/hashes and receive its own integrated source/image tests and notices before publication.

The [prepared UPF inquiry](v111-upf-model-license-inquiry.md) is still a useful way to resolve the conflicting pages and conversion/distribution questions. No email has been sent by this task. Its unsent status is a workflow fact, not proof that public-license rights do not exist.

## Release status

**The rights gate is still unresolved, but it is not categorically dependent on receiving a new private permission letter.** This clarification does not approve the current image, silently change its model files, settle commercial permissions, or waive any security, recovery, user-acceptance or publication decision. The required outcome is documented applicable rights and compliance, not correspondence for its own sake.
