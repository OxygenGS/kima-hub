#!/usr/bin/env python3
"""Inventory direct Debian dependencies inside a disposable built AIO image.

Run by piping this script to docker run -i --entrypoint python3 IMAGE -.
No /data mount. Package linkage is NOT exploitability proof.
"""
from __future__ import annotations
from collections import deque
import json
import platform
import re
import subprocess
import sys

PRIORITY = ("libaom3", "libglib2.0-0", "libmbedcrypto7",
            "libsqlite3-0", "libxml2", "zlib1g", "ffmpeg",
            "libavcodec59", "libavformat59", "librist4")

def dependency_names(declaration: str) -> set[str]:
    names = set()
    for group in declaration.split(","):
        for alternative in group.split("|"):
            match = re.match(r"\s*([a-z0-9][a-z0-9+.-]*)(?::(?:any|native))?\b", alternative)
            if match:
                names.add(match.group(1))
    return names

def dependency_chain(packages: dict[str, dict], source: str, target: str, max_hops: int = 5) -> list[str]:
    # Follow installed-package reverse dependencies: a source vulnerability can
    # matter to a higher-level consumer. This is metadata, not call-path proof.
    if source not in packages or target not in packages:
        return []
    parents: dict[str, list[str]] = {}
    for name, meta in packages.items():
        for dependency in meta["depends"]:
            if dependency in packages:
                parents.setdefault(dependency, []).append(name)
    queue = deque([(source, [source])])
    visited = {source}
    while queue:
        current, path = queue.popleft()
        if current == target:
            return path
        if len(path) > max_hops:
            continue
        for dependent in sorted(parents.get(current, [])):
            if dependent not in visited:
                visited.add(dependent)
                queue.append((dependent, path + [dependent]))
    return []


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
        "limitation": "Declared Debian dependencies only, NOT all dynamic loading or exploitability",
        "paths_to_ffmpeg": {
            name: dependency_chain(packages, name, "ffmpeg")
            for name in ("libmbedcrypto7", "libaom3", "libglib2.0-0",
                         "libxml2", "zlib1g", "libsqlite3-0")
        },
        "priority_packages": packages_of_interest,
    }

def main() -> int:
    if sys.argv[1:] == ["--self-test"]:
        assert dependency_names("libmbedcrypto7 (>= 2.28), libaom3:any | libaom3") == {"libmbedcrypto7", "libaom3"}
        sample = "\n".join(f"sample{i}\t1.0\tlibmbedcrypto7 (>= 2), zlib1g" for i in range(85))
        sample += "\nlibmbedcrypto7\t2.28.3-1\tlibc6\n"
        assert len(collect(sample)["priority_packages"][2]["direct_reverse_dependencies"]) == 85
        packages = {
            "libmbedcrypto7": {"depends": set()},
            "librist4": {"depends": {"libmbedcrypto7"}},
            "libavformat59": {"depends": {"librist4"}},
            "ffmpeg": {"depends": {"libavformat59"}},
        }
        assert dependency_chain(packages, "libmbedcrypto7", "ffmpeg") == [
            "libmbedcrypto7", "librist4", "libavformat59", "ffmpeg"
        ]
        assert dependency_chain(packages, "absent", "ffmpeg") == []
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
