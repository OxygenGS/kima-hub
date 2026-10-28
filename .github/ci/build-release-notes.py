#!/usr/bin/env python3
"""Generate GitHub release notes from the exact version section of CHANGELOG.md."""
from __future__ import annotations

import argparse
from pathlib import Path
import re

VERSION_RE = re.compile(r"^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$")
HEADING_RE = re.compile(r"^## OxygenGS fork (v[0-9]+\.[0-9]+\.[0-9]+) — .+$")


def extract_section(changelog: str, version: str) -> str:
    if not VERSION_RE.fullmatch(version):
        raise ValueError(f"Invalid stable version: {version}")
    lines = changelog.splitlines()
    starts = [
        i for i, line in enumerate(lines)
        if (match := HEADING_RE.fullmatch(line)) and match.group(1) == version
    ]
    if len(starts) != 1:
        raise ValueError(f"Expected exactly one changelog section for {version}, found {len(starts)}")
    start = starts[0] + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("## ")), len(lines))
    body_lines = [
        line for line in lines[start:end]
        if not line.strip().startswith("- **Release gate:**")
    ]
    body = "\n".join(body_lines).strip()
    if not body or len(body) < 50:
        raise ValueError(f"Missing meaningful changelog notes for {version}")
    return body


def generate(changelog: str, version: str) -> str:
    notes = extract_section(changelog, version)
    return (
        f"# Kima Hub {version}\n\n"
        f"## What's new\n\n{notes}\n\n"
        f"## Docker image\n\n"
        f"`ghcr.io/oxygengs/kima-hub:{version}` (linux/amd64 and linux/arm64).\n\n"
        "Back up the complete persistent `/data` volume before upgrading. "
        "An older container may not be compatible with a migrated database; "
        "rollback requires an independent pre-upgrade data backup.\n\n"
        "Read the [safe update and restore guide]"
        "(https://github.com/OxygenGS/kima-hub/blob/main/docs/safe-aio-updates.md).\n\n"
        "The `:latest` alias is **not** automatically updated.\n"
    )


def self_test() -> None:
    sample = (
        "# Changelog\n\n"
        "## OxygenGS fork v1.12.1 — release preparation (unpublished)\n"
        "Maintenance notes with adequate detail that explain the user-facing patch.\n"
        "- **Release gate:** This is an internal publication checklist.\n"
        "\n## OxygenGS fork v1.12.0 — released 2026-10-28\n"
        "Previous release with enough detail that it stands alone in the notes.\n"
    )
    notes = generate(sample, "v1.12.1")
    assert "Maintenance notes" in notes and "Previous release" not in notes
    assert "**Release gate:**" not in notes
    assert "ghcr.io/oxygengs/kima-hub:v1.12.1" in notes
    for bad in ("v1.12.2", "v1.12.1-rc1", "../../file"):
        try:
            generate(sample, bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Unsafe or unknown tag accepted: {bad}")
    print("Release note extraction self-test: PASS")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--tag")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.tag or not args.output:
        parser.error("--tag and --output are required")
    source = Path(__file__).resolve().parents[2] / "CHANGELOG.md"
    notes = generate(source.read_text(encoding="utf-8"), args.tag)
    args.output.write_text(notes, encoding="utf-8")
    print(f"Generated release notes for {args.tag}: {args.output}")


if __name__ == "__main__":
    main()
