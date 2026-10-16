#!/usr/bin/env python3
"""Inventory direct Debian dependencies inside a disposable built AIO image.

Run by piping this script to docker run -i --entrypoint python3 IMAGE -.
No /data mount. Package linkage is NOT exploitability proof.
"""
from __future__ import annotations
import json
import platform
import re
import subprocess
import sys

PRIORITY = ("libaom3", "libglib2.0-0", "libmbedcrypto7",
            "libsqlite3-0", "libxml2", "zlib1g", "ffmpeg",
            "libavcodec59", "libavformat59")

def dependency_names(declaration: str) -> set[str]:
    names = set()
    for group in declaration.split(","):
        for alternative in group.split("|"):
            match = re.match(r"\s*([a-z0-9][a-z0-9+.-]*)(?::(?:any|native))?\b", alternative)
            if match:
                names.add(match.group(1))
    return names

def collect(text: str) -> dict:
    packages: dict[str, dict] = {}
    for line in text.splitlines():
        row = line.split("\t", 2)
        if len(row) == 3 and row[0] and row[1]:
            packages[row[0]] = {"version": row[1], "depends": dependency_names(row[2])}
    if len(packages) < 80:
        raise ValueError("Incomplete installed Debian package database")
    packages_of_interest = []
    for name in PRIORITY:
        installed = packages.get(name)
        packages_of_interest.append({
            "package": name,
            "installed_version": installed["version"] if installed else None,
            "direct_reverse_dependencies": sorted(
                pkg for pkg, data in packages.items()
                if pkg != name and name in data["depends"]
            ),
        })
    return {
        "architecture": platform.machine(),
        "installed_package_count": len(packages),
        "limitation": "Declared direct Debian dependencies, NOT all dynamic loading or exploitability",
        "priority_packages": packages_of_interest,
    }

def main() -> int:
    if sys.argv[1:] == ["--self-test"]:
        assert dependency_names("libmbedcrypto7 (>= 2.28), libaom3:any | libaom3") == {"libmbedcrypto7", "libaom3"}
        sample = "\n".join(f"sample{i}\t1.0\tlibmbedcrypto7 (>= 2), zlib1g" for i in range(85))
        sample += "\nlibmbedcrypto7\t2.28.3-1\tlibc6\n"
        assert len(collect(sample)["priority_packages"][2]["direct_reverse_dependencies"]) == 85
        print("Runtime package inventory self-test: PASS")
        return 0
    if sys.argv[1:]:
        print("Usage: inventory-critical-image-packages.py [--self-test]", file=sys.stderr)
        return 2
    try:
        data = subprocess.check_output(
            ["dpkg-query", "-W", "-f=${Package}\\t${Version}\\t${Depends}\\n"],
            text=True, stderr=subprocess.PIPE,
        )
        report = collect(data)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Cannot inventory image package dependencies: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0

if __name__ == "__main__":
    sys.exit(main())
