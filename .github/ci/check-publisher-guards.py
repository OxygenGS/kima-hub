#!/usr/bin/env python3
"""Static, no-publish assertion that both Docker release channels block fixable CVEs.

Do not mistake this for an image scan: the assembled-image evaluator and the
manual review of unfixed Debian findings remain separate release gates.
"""
from pathlib import Path
import sys


RELEASES = {
    "docker-publish.yml": (
        "Scan actual AMD64 image and fail on patchable HIGH/CRITICAL",
        "Scan assembled AMD64 image for embedded secrets",
        "kima:scan",
        'check-release-metadata.py --tag "$VERSION"',
    ),
    "prerelease.yml": (
        "Scan candidate AMD64 image and block fixable HIGH/CRITICAL",
        "Scan candidate image for embedded secrets before publication",
        "kima:prerelease-scan",
        "check-release-metadata.py --candidate",
    ),
}


def step(text: str, name: str) -> str:
    marker = f"            - name: {name}\n"
    if text.count(marker) != 1:
        raise ValueError(f"Expected exactly one publication step: {name}")
    rest = text.split(marker, 1)[1]
    return rest.split("\n            - name: ", 1)[0]


def check_workflow(text: str, image: str, secret: str, tag: str, metadata: str) -> None:
    if metadata not in text:
        raise ValueError("Missing exact release-version validation")
    vuln_step = step(text, image)
    for required in (
        "trivy image", "--scanners vuln", "--severity HIGH,CRITICAL",
        "--format json", '--output "$RUNNER_TEMP/', "--exit-code 0",
        "evaluate-image-vulnerabilities.py", "--self-test", " amd64",
        tag,
    ):
        if required not in vuln_step:
            raise ValueError(f"Missing mandatory assembled-image vulnerability gate: {required}")
    for prohibited in ("--ignore-unfixed", "--ignorefile", "|| true"):
        if prohibited in vuln_step:
            raise ValueError(f"Image CVE gate may hide findings with {prohibited}")
    secrets = step(text, secret)
    for required in ("trivy image", "--scanners secret", "--exit-code 1", tag):
        if required not in secrets:
            raise ValueError(f"Missing secret scanning guard: {required}")
    if "push: true" not in text:
        raise ValueError("No publication step to protect")


def self_test() -> None:
    image_step = RELEASES["docker-publish.yml"][0]
    secret_step = RELEASES["docker-publish.yml"][1]
    tag = RELEASES["docker-publish.yml"][2]
    meta = RELEASES["docker-publish.yml"][3]
    example = (
        meta + "\n" +
        f"            - name: {image_step}\n"
        f"              run: trivy image --scanners vuln --severity HIGH,CRITICAL "
        f'--format json --output "$RUNNER_TEMP/file.json" --exit-code 0 {tag}\n'
        '                  python3 .github/ci/evaluate-image-vulnerabilities.py --self-test\n'
        '                  python3 .github/ci/evaluate-image-vulnerabilities.py "$RUNNER_TEMP/file.json" amd64\n'
        f"            - name: {secret_step}\n"
        f"              run: trivy image --scanners secret --exit-code 1 {tag}\n"
        "              push: true\n"
    )
    check_workflow(example, image_step, secret_step, tag, meta)
    for broken in (
        example.replace("--scanners vuln", "--scanners vuln --ignorefile .trivyignore"),
        example.replace("--exit-code 1", "--exit-code 0"),
        example.replace("evaluate-image-vulnerabilities.py", "unverified-image-evaluator.py"),
    ):
        try:
            check_workflow(broken, image_step, secret_step, tag, meta)
        except ValueError:
            pass
        else:
            raise AssertionError("Publishing guard self-test accepted a weakened workflow")
    print("Publishing-image gate self-tests: PASS")


def main() -> int:
    try:
        self_test()
        root = Path(__file__).resolve().parents[2]
        for filename, settings in RELEASES.items():
            body = (root / ".github" / "workflows" / filename).read_text(encoding="utf-8")
            check_workflow(body, *settings)
            print(f"PASS: {filename} blocks patchable image vulnerabilities and embedded secrets")
    except (OSError, ValueError, AssertionError) as error:
        print(f"Publisher safety check FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
