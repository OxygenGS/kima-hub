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



def job_section(text: str, name: str) -> str:
    """Extract one two-space-indented GitHub Actions job, fail closed on drift."""
    marker = f"  {name}:\n"
    if text.count(marker) != 1:
        raise ValueError(f"Expected one pre-release job: {name}")
    content = text.split(marker, 1)[1]
    import re
    next_job = re.search(r"(?m)^  [a-z][a-z0-9-]*:\s*$", content)
    return content[:next_job.start()] if next_job else content


def check_native_prerelease(text: str) -> None:
    """Native two-arch publisher must scan the loaded bytes before any push."""
    if "on:\n  workflow_dispatch:" not in text:
        raise ValueError("Pre-release must be manual workflow_dispatch only")
    event_section = text.split("on:\n", 1)[1].split("\nconcurrency:", 1)[0]
    if "\n  push:" in event_section or "\n  pull_request:" in event_section:
        raise ValueError("Candidate publication must never trigger on a push/PR")
    if "cancel-in-progress: false" not in text:
        raise ValueError("Candidate publish may not cancel a running build")
    validate = job_section(text, "validate")
    native = job_section(text, "native-build")
    assemble = job_section(text, "assemble")
    if "check-release-metadata.py --candidate" not in validate:
        raise ValueError("Candidate metadata gate missing")
    if "TAG_SUFFIX" not in validate or "^[a-z0-9][a-z0-9.-]{0,31}$" not in validate:
        raise ValueError("Tag suffix must be validated before building")

    for required in (
        "arch: amd64", "runner: ubuntu-latest", "arch: arm64",
        "runner: ubuntu-24.04-arm", "runs-on: ${{ matrix.runner }}",
        "fail-fast: false", "needs: validate", "load: true",
        "push: false", "platforms: linux/${{ matrix.arch }}",
        "tags: kima:prerelease-scan",
    ):
        if required not in native:
            raise ValueError(f"Missing isolated native architecture gate: {required}")

    scan_index = native.find("- name: Block fixable HIGH/CRITICAL vulnerabilities in this image")
    secret_index = native.find("- name: Block embedded secrets before image push")
    push_index = native.find("- name: Push precisely the scanned native image to staging tag")
    login_index = native.find("- uses: docker/login-action@v3")
    if min(scan_index, secret_index, login_index, push_index) < 0:
        raise ValueError("Missing platform-local scans or staging push")
    if not scan_index < secret_index < login_index < push_index:
        raise ValueError("Image may only be pushed after both scans pass")
    vulnerability = native[scan_index:secret_index]
    secrets = native[secret_index:login_index]
    for required in (
        "trivy image", "--scanners vuln", "--severity HIGH,CRITICAL",
        "--format json", "--exit-code 0", "evaluate-image-vulnerabilities.py",
        "--self-test", '"$ARCH"', "kima:prerelease-scan",
    ):
        if required not in vulnerability:
            raise ValueError(f"Missing native vulnerability check: {required}")
    if "--ignorefile" in vulnerability or "--ignore-unfixed" in vulnerability or "|| true" in vulnerability:
        raise ValueError("Native image vulnerability evaluator must see unfixed advisories")
    for required in ("trivy image", "--scanners secret", "--exit-code 1", "kima:prerelease-scan"):
        if required not in secrets:
            raise ValueError(f"Missing native secret scan: {required}")
    if "|| true" in secrets:
        raise ValueError("Secret scan cannot ignore errors")
    pushed = native[push_index:]
    for required in (
        'docker tag kima:prerelease-scan "$arch_tag"',
        'docker push "$arch_tag"',
    ):
        if required not in pushed:
            raise ValueError(f"Staging push must use the exact scanned local image: {required}")

    if "needs: [validate, native-build]" not in assemble:
        raise ValueError("Combined manifest must require both platform scans")
    for required in (
        "docker buildx imagetools create", "docker buildx imagetools inspect --raw",
        '"linux","amd64"', '"linux","arm64"', "sha256:",
    ):
        if required not in assemble:
            raise ValueError(f"Multi-arch published manifest verification missing: {required}")
    check_at = assemble.find("docker buildx imagetools inspect --raw")
    alias_at = assemble.find('docker buildx imagetools create -t "${IMAGE}:prerelease"')
    if check_at < 0 or alias_at < check_at:
        raise ValueError("Moving prerelease alias may only be published after manifest validation")
    import re
    if re.search(r"(?:-t |tags:|docker tag ).*?:latest\\b", assemble):
        raise ValueError("A prerelease may never publish latest")


def native_self_test() -> None:
    """Mutating the real native workflow must make this guard reject it."""
    root = Path(__file__).resolve().parents[2]
    original = (root / ".github/workflows/prerelease.yml").read_text(encoding="utf-8")
    check_native_prerelease(original)
    for a, b in (
        ("--scanners vuln", "--scanners fs"),
        ("--scanners secret", "--scanners vuln"),
        ("--exit-code 1", "--exit-code 0"),
        ("needs: [validate, native-build]", "needs: validate"),
        ('docker tag kima:prerelease-scan "$arch_tag"', 'docker tag other:image "$arch_tag"'),
    ):
        altered = original.replace(a, b, 1)
        if altered == original:
            raise AssertionError(f"Missing native publisher self-test anchor: {a}")
        try:
            check_native_prerelease(altered)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Unsafe native candidate mutation accepted: {a}")
    print("Native AMD64+ARM64 candidate security-gate self-tests: PASS")



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
        native_self_test()
        print("PASS: prerelease.yml enforces native AMD64+ARM64 pre-push scans and gated index")
    except (OSError, ValueError, AssertionError) as error:
        print(f"Publisher safety check FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
