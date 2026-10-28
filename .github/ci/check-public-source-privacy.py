#!/usr/bin/env python3
"""Block accidental public commits of local host, container and LAN references.

Only tracked source is checked. This is a guard, not a historical/secret audit.
Report paths and line numbers without reproducing potentially private values.
"""
from __future__ import annotations

from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
RULES = {
    "numbered host container": re.compile(r"\b(?:CT|LXC)[ _-]*\d{2,5}\b", re.IGNORECASE),
    "interactive host prompt": re.compile(r"\broot@[a-z0-9][a-z0-9.-]+\b", re.IGNORECASE),
    "private LAN address": re.compile(
        r"\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"
    ),
}


def findings(content: str) -> list[tuple[int, str]]:
    issues = []
    for line_number, line in enumerate(content.splitlines(), 1):
        for label, pattern in RULES.items():
            if pattern.search(line):
                issues.append((line_number, label))
    return issues


def self_test() -> None:
    synthetic_id = "CT" + " " + str(777)
    synthetic_shell = "root" + "@machine.example"
    synthetic_ip = ".".join(("192", "168", "5", "6"))
    actual = {name for _, name in findings("\n".join((synthetic_id, synthetic_shell, synthetic_ip)))}
    assert actual == set(RULES)
    assert not findings("localhost, example.com, and user@host are not private environment addresses")
    print("Privacy guard self-test: PASS")


def main() -> int:
    self_test()
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).split(b"\0")
    bad = []
    for entry in tracked:
        if not entry:
            continue
        path = ROOT / entry.decode("utf-8", errors="surrogateescape")
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\0" in data[:8192]:
            continue
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        for line, label in findings(content):
            # Do not print the matching line, even on failure.
            bad.append((str(path.relative_to(ROOT)), line, label))
    if bad:
        for path, line, label in bad[:70]:
            print(f"Privacy guard: {path}:{line}: {label}")
        print(f"Privacy guard FAILED: {len(bad)} possible public local-installation references")
        return 1
    print("Privacy guard PASS: tracked public source contains no matching local-installation references")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
