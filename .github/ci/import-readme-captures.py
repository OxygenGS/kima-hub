#!/usr/bin/env python3
"""Import reviewed synthetic screenshots from a successful released-source CI run.

Only the eight allowlisted PNG images are written. No trace, credentials, logs,
user uploads or arbitrary archive paths are extracted. Tags/images are untouched.
"""
from __future__ import annotations
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import zipfile
import zlib

REPO = "OxygenGS/kima-hub"
TAG = "v1.13.0"
SOURCE = "63ecef07247173f102a787276d1dc364c1495b8a"
RELEASE = "03bed37c1e129c21eca95a9aed86e7ff28f6d88b"
TREE = "ed8e1596bf38dab3ff5e1cc31322c34bf896748c"
RUN = 40768222515
ARTIFACT = 12852945217
DIGEST = "dde1cdbebd4e614026168e289750204ddad5403a42ad7a0b05083ec6f3f75579"
ROOT = Path(__file__).resolve().parents[2]
PNG = b"\x89PNG\r\n\x1a\n"


def api(path: str, binary: bool = False):
    raw = subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"])
    return raw if binary else json.loads(raw)


def clean_png(data: bytes, expected: tuple[int, int]) -> bytes:
    if not data.startswith(PNG):
        raise ValueError("Not a PNG")
    keep = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"sRGB", b"gAMA", b"cHRM", b"iCCP"}
    output = bytearray(PNG)
    position = len(PNG)
    dimensions = None
    ended = False
    while position + 12 <= len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        kind = data[position + 4:position + 8]
        end = position + 12 + length
        if end > len(data):
            raise ValueError("Truncated PNG")
        payload = data[position + 8:position + 8 + length]
        crc = struct.unpack(">I", data[position + 8 + length:end])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise ValueError("Invalid PNG checksum")
        if kind == b"IHDR":
            dimensions = struct.unpack(">II", payload[:8])
        if kind in keep:
            output.extend(data[position:end])
        position = end
        if kind == b"IEND":
            ended = True
            break
    if dimensions != expected or not ended or position != len(data):
        raise ValueError("Unexpected screenshot dimensions or structure")
    return bytes(output)


def replace_once(path: str, before: str, after: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if before not in text and after in text:
        return
    if text.count(before) != 1:
        raise ValueError(f"Expected unique publication marker in {path}")
    target.write_text(text.replace(before, after, 1), encoding="utf-8")


def main() -> None:
    if os.environ.get("GITHUB_REPOSITORY", REPO) != REPO:
        raise ValueError("Unexpected repository")
    run = api(f"actions/runs/{RUN}")
    if (run.get("conclusion"), run.get("status"), run.get("head_sha")) != ("success", "completed", SOURCE):
        raise ValueError("Screenshot run was not successful on the reviewed source")
    release = api(f"releases/tags/{TAG}")
    if release.get("draft") or release.get("prerelease") or not release.get("published_at"):
        raise ValueError("Stable release is not published")
    ref = api(f"git/ref/tags/{TAG}")
    if ref["object"]["type"] != "commit" or ref["object"]["sha"] != RELEASE:
        raise ValueError("Release tag changed")
    if any(api(f"git/commits/{sha}")["tree"]["sha"] != TREE for sha in (SOURCE, RELEASE)):
        raise ValueError("Screenshots do not match the released source tree")
    artifact = api(f"actions/artifacts/{ARTIFACT}")
    if artifact.get("expired") or artifact.get("name") != "v113-application-browser-amd64":
        raise ValueError("Unexpected or expired artifact")
    if artifact.get("workflow_run", {}).get("id") != RUN:
        raise ValueError("Artifact belongs to a different run")
    raw = api(f"actions/artifacts/{ARTIFACT}/zip", binary=True)
    if hashlib.sha256(raw).hexdigest() != DIGEST:
        raise ValueError("Screenshot archive checksum mismatch")
    destination = ROOT / "assets/screenshots/v1.13"
    destination.mkdir(parents=True, exist_ok=True)
    records = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for viewport, dimensions in (("desktop", (1440, 960)), ("mobile", (390, 844))):
            for screen in ("home", "album", "overlay", "queue"):
                member = f"listener/application-integrated-en--47580-playback-and-queue-behavior-{viewport}/{screen}.png"
                info = archive.getinfo(member)
                if info.file_size > 2_000_000:
                    raise ValueError("Screenshot larger than expected")
                image = clean_png(archive.read(member), dimensions)
                name = f"{viewport}-{screen}.png"
                (destination / name).write_bytes(image)
                records.append({"file": name, "archive_member": member, "width": dimensions[0], "height": dimensions[1], "sha256": hashlib.sha256(image).hexdigest()})
    provenance = {
        "release": TAG, "release_commit": RELEASE, "source_commit": SOURCE, "source_tree": TREE,
        "workflow_run": RUN, "artifact": ARTIFACT, "archive_sha256": DIGEST,
        "notice": "Real application browser captures with synthetic audio/library data. CI build label retained. Text/EXIF/time PNG metadata removed; pixels unchanged.",
        "screenshots": records,
    }
    (destination / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    replace_once("CHANGELOG.md", "## OxygenGS fork v1.13.0 \u2014 release preparation (unpublished)", "## OxygenGS fork v1.13.0 \u2014 released 2026-10-28")
    replace_once("CHANGELOG.md", "- **Release gate:** Candidate only. Require full repository CI, actual disposable AIO browser/audio acceptance, exact-source native AMD64/ARM64 preflight and explicit stable publication approval. No image or release is published by source preparation.", "- **Release verification:** Full PR validation, real AIO browser/audio acceptance and independent upgrade/restore tests passed. Native preflight 40773886516 verified the exact main source; stable publisher 40776257407 completed on its retry. Existing dependency advisories remain documented; passing these checks is not a zero-risk guarantee.")
    p = ROOT / "docs/install.md"
    p.write_text(p.read_text(encoding="utf-8").replace("v1.12.1", TAG), encoding="utf-8")
    replace_once("docs/install.md", "It includes the missing English/Dutch in-app v1.12.0 release notes and retains the existing fork features, including modern Symfonium/Feishin authentication and Symfonium synchronization without Compatibility Mode.", "It includes the redesigned home, music pages, players and queue, with English/Dutch in-app release notes and the existing modern Symfonium/Feishin authentication.")
    replace_once("docs/install.md", "**v1.13.0 is an unpublished source candidate.** Do not use a v1.13.0 image until its native publisher and GitHub release have completed. The examples below intentionally use the currently published stable release.", "**v1.13.0 is published.** Its native AMD64/ARM64 images and GitHub release are available. The examples below select this version explicitly; existing installations still require a verified backup before upgrading.")
    replace_once("docs/install.md", "| Previous stable | `ghcr.io/oxygengs/kima-hub:v1.12.0`", "| Previous stable | `ghcr.io/oxygengs/kima-hub:v1.12.1`")
    replace_once(".github/ci/check-fork-compose.sh", 'expected_image="ghcr.io/oxygengs/kima-hub:v1.12.1"', 'expected_image="ghcr.io/oxygengs/kima-hub:v1.13.0"')
    replace_once("docs/release-v1.13.md", "Status: **unpublished source candidate**. This document is a checklist, not a claim that every gate has already passed. The public product remains Kima Hub \u2014 Oxygen's Fork.", "Status: **published 2026-10-28** at commit `03bed37`. Final PR validation: run `40768222515`; exact-source native preflight: `40773886516`; successful stable publication: `40776257407`, attempt 2. The checks below record the publication requirements. The public product remains Kima Hub \u2014 Oxygen's Fork.")
    p = ROOT / "docs/release-v1.13.md"
    text = p.read_text(encoding="utf-8")
    start = text.index("Candidate preparation writes matching")
    end = text.index("\n\n## Installation boundary", start)
    text = text[:start] + "The published release includes matching package versions, changelog and English/Dutch in-app notes. README and installation guidance now select verified v1.13.0. Current screenshots come from the successful application validation run using synthetic data; their source tree matches the published tag. A documentation-only update does not rebuild the immutable release image." + text[end:]
    p.write_text(text, encoding="utf-8")
    print(f"Imported {len(records)} verified synthetic screenshots and refreshed published release documentation")


if __name__ == "__main__":
    main()
