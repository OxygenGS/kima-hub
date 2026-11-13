#!/usr/bin/env python3
"""Check tracked Markdown and inline HTML image links against repository files.

A small offline guard for broken relative documentation links. External URLs,
application routes and fragment-only anchors are outside this filesystem check.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]

LOCAL_LINK = re.compile(
    r"\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+[\"'][^\"']+[\"'])?\)"
    r"|<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)
EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|/|#)", re.IGNORECASE)


def missing_links(root: Path, file: Path) -> list[tuple[int, str]]:
    issues: list[tuple[int, str]] = []
    text = file.read_text(encoding="utf-8")
    for match in LOCAL_LINK.finditer(text):
        href = (match.group(1) or match.group(2) or "").strip("<>")
        if not href or EXTERNAL.match(href):
            continue
        relative = unquote(href.split("#", 1)[0].split("?", 1)[0])
        if not relative:
            continue
        target = (file.parent / relative).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError:
            # A public relative documentation link should never leave this checkout.
            issues.append((text.count("\n", 0, match.start()) + 1, href))
            continue
        if not target.exists():
            issues.append((text.count("\n", 0, match.start()) + 1, href))
    return issues


def self_test() -> None:
    with TemporaryDirectory() as temp:
        root = Path(temp)
        (root / "docs").mkdir()
        (root / "docs" / "current.md").write_text("# Current\n")
        source = root / "README.md"
        source.write_text(
            "[Working](docs/current.md) [Anchor](#overview) "
            "[External](https://example.org/) [Missing](docs/removed.md)\n"
            '<img src="docs/current.md" />\n',
            encoding="utf-8",
        )
        assert missing_links(root, source) == [(1, "docs/removed.md")]
    print("Relative documentation link checker self-test: PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).split(b"\0")
    failed: list[str] = []
    checked = 0
    for raw in names:
        if not raw:
            continue
        name = raw.decode("utf-8")
        if not name.endswith(".md"):
            continue
        source = ROOT / name
        if not source.is_file():
            continue
        checked += 1
        for line, href in missing_links(ROOT, source):
            failed.append(f"{name}:{line}: {href}")

    if failed:
        for item in failed[:40]:
            print("BROKEN LOCAL DOC LINK:", item)
        print(f"Documentation link check FAILED: {len(failed)} invalid references")
        return 1
    print(f"Documentation link check PASS: {checked} tracked Markdown files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
