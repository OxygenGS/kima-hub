#!/usr/bin/env python3
"""Validate fork release metadata before stable publishing or candidate review.

This check is intentionally read-only. It never creates git tags or pushes images.
Usage:
  python3 .github/ci/check-release-metadata.py --candidate
  python3 .github/ci/check-release-metadata.py --tag v1.11.0
  python3 .github/ci/check-release-metadata.py --self-test
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

TAG_RE = re.compile(r"^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
PUBLISHED_BASELINE = (1, 10, 0)


def valid_tag(tag: str) -> tuple[int, int, int]:
    match = TAG_RE.fullmatch(tag)
    if not match:
        raise ValueError("Stable release tag must be vMAJOR.MINOR.PATCH, without suffix")
    number = tuple(int(v) for v in match.groups())
    if number <= PUBLISHED_BASELINE:
        raise ValueError("Fork stable release version must be newer than existing v1.10.0")
    return number


def get_version(root: Path, side: str) -> str:
    package = json.loads((root / side / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((root / side / "package-lock.json").read_text(encoding="utf-8"))
    package_version = package.get("version")
    if not package_version or package_version != lock.get("version") or package_version != lock.get("packages", {}).get("", {}).get("version"):
        raise ValueError(f"{side}: package.json and package-lock.json (including lockfile root) must have identical versions")
    if lock.get("lockfileVersion") != 3:
        raise ValueError(f"{side}: expected npm lockfile version 3")
    return package_version


def check(root: Path, tag: str | None) -> str:
    backend = get_version(root, "backend")
    frontend = get_version(root, "frontend")
    if backend != frontend:
        raise ValueError(f"Backend version {backend} differs from frontend version {frontend}")
    valid_tag("v" + backend)
    if tag and tag != "v" + backend:
        raise ValueError(f"Requested release tag {tag} does not match checked-in version v{backend}")
    notes = (root / "CHANGELOG.md").read_text(encoding="utf-8")
    if f"## OxygenGS fork v{backend} — release preparation (unpublished)" not in notes:
        raise ValueError(f"Missing fork-specific unreleased v{backend} CHANGELOG entry")
    return backend


def self_test() -> None:
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as temp:
        root = Path(temp)
        for side in ("backend", "frontend"):
            folder = root / side
            folder.mkdir()
            (folder / "package.json").write_text('{"version":"1.11.0"}', encoding="utf-8")
            (folder / "package-lock.json").write_text(
                '{"name":"kima","version":"1.11.0","lockfileVersion":3,"packages":{"":{"version":"1.11.0"}}}',
                encoding="utf-8)
        (root / "CHANGELOG.md").write_text("## OxygenGS fork v1.11.0 — release preparation (unpublished)\n", encoding="utf-8")
        assert check(root, "v1.11.0") == "1.11.0"
        for invalid in ("v1.10.0", "v1.11.0-rc1", "v01.11.0", "latest", "v1.11.1"):
            try:
                check(root, invalid)
            except ValueError:
                pass
            else:
                raise AssertionError(f"Invalid or mismatched tag accepted: {invalid}")
        (root / "frontend" / "package-lock.json").write_text(
            '{"version":"1.10.0","lockfileVersion":3,"packages":{"":{"version":"1.10.0"}}}',
            encoding="utf-8",
        )
        try:
            check(root, None)
        except ValueError:
            pass
        else:
            raise AssertionError("Frontend/lockfile mismatch was not blocked")
    print("Release metadata guard self-tests: PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--tag")
    group.add_argument("--candidate", action="store_true")
    group.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
        else:
            repo = Path(__file__).resolve().parents[2]
            version = check(repo, args.tag)
            print(f"PASS: fork v{version} source packages, both lockfiles and CHANGELOG agree")
            print("This check does not authorize tagging, merging, image publication or deployment.")
    except (ValueError, FileNotFoundError, KeyError, json.JSONDecodeError, AssertionError) as exc:
        print(f"Release metadata guard FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
