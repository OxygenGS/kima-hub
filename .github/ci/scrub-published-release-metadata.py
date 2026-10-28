#!/usr/bin/env python3
"""Remove accidental local container identifiers from existing GitHub Releases.

This script changes release descriptions only, never tags, source commits or images.
Called only by the authenticated post-merge GitHub workflow.
"""
from __future__ import annotations
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

LOCAL_INSTANCE = re.compile(r"\b(?:CT|LXC)[ _-]*\d{2,5}/?", re.IGNORECASE)


def gh_api(*args: str) -> str:
    return subprocess.check_output(["gh", "api", *args], text=True)


def main() -> None:
    repo = os.environ["GH_REPO"]
    page = 1
    updated = 0
    while True:
        releases = json.loads(gh_api(f"repos/{repo}/releases?per_page=100&page={page}"))
        for release in releases:
            body = release.get("body") or ""
            safe = LOCAL_INSTANCE.sub("", body)
            if safe == body:
                continue
            with tempfile.TemporaryDirectory() as tmp:
                patch = Path(tmp) / "release.json"
                patch.write_text(json.dumps({"body": safe}), encoding="utf-8")
                gh_api("-X", "PATCH", f"repos/{repo}/releases/{release['id']}", "--input", str(patch))
            updated += 1
            print(f"Sanitized public release description: {release['tag_name']}")
        if len(releases) < 100:
            break
        page += 1
    print(f"Release metadata cleanup complete: {updated} updated")


if __name__ == "__main__":
    main()
