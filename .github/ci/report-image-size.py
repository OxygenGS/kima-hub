#!/usr/bin/env python3
"""Read-only Docker image size report for native platform images.

Usage: python3 .github/ci/report-image-size.py IMAGE
Requires a locally pulled/built image and the Docker CLI.
Does not run the image, inspect files, or upload data.
"""
import json
import subprocess
import sys


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def main():
    if len(sys.argv) != 2:
        print("Usage: report-image-size.py IMAGE", file=sys.stderr)
        return 2
    image = sys.argv[1]
    details = json.loads(docker("image", "inspect", image))[0]
    history = [
        json.loads(line)
        for line in docker("history", "--no-trunc", "--format", "{{json .}}", image).splitlines()
        if line.strip()
    ]
    print(f"Image: {image}")
    print(f"Platform: {details.get('Os')}/{details.get('Architecture')}")
    size = details["Size"]
    print(f"Local uncompressed image size: {size / 1024**3:.2f} GiB ({size} bytes)")
    print("Layer history (Docker's human-readable sizes; not download sizes):")
    for item in history:
        command = (item.get("CreatedBy") or "").replace("\n", " ")
        print(f"  {item.get('Size', '?'):>12}  {command[:150]}")
    print("Note: image inspect Size is not the compressed registry transfer size.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
