#!/usr/bin/env python3
"""Set Kima fork version consistently in npm manifests and lockfiles."""
import argparse
import json
from pathlib import Path

FILES = (
    "frontend/package.json", "frontend/package-lock.json",
    "backend/package.json", "backend/package-lock.json",
)


def bump(version: str) -> None:
    for filename in FILES:
        path = Path(filename)
        data = json.loads(path.read_text(encoding="utf-8"))
        previous = data["version"]
        data["version"] = version
        if filename.endswith("package-lock.json"):
            package = data["packages"][""]
            if package["version"] != previous:
                raise ValueError(f"{filename}: root lockfile version mismatch")
            package["version"] = version
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    if not args.version.startswith("1.11.") or not args.version[5:].isdigit():
        parser.error("Expected stable 1.11.x version")
    bump(args.version)
    for filename in FILES:
        data = json.loads(Path(filename).read_text(encoding="utf-8"))
        assert data["version"] == args.version
        if filename.endswith("package-lock.json"):
            assert data["packages"][""]["version"] == args.version


if __name__ == "__main__":
    main()
