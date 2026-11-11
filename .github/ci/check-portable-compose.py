#!/usr/bin/env python3
"""Validate the public AIO Compose installer without starting containers.

A missing MUSIC_PATH must fail closed; the published stable tag must be
selected only for new users who leave VERSION unset. Never inspect or
change any real host music mount or running Docker deployment here.
"""

import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker-compose.prod.yml"
LIDARR_OVERRIDE = ROOT / "docker-compose.lidarr-handoff.yml"


def checked_release_image():
    # Align the source-level Compose default with both versioned packages.
    # A floating tag, mismatched packages or stale release pin fails closed.
    backend = json.loads((ROOT / "backend/package.json").read_text(encoding="utf-8"))["version"]
    frontend = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))["version"]
    if backend != frontend or not __import__("re").fullmatch(r"[0-9]+\\.[0-9]+\\.[0-9]+", backend):
        raise AssertionError("Inconsistent or invalid native release versions")
    return f"ghcr.io/oxygengs/kima-hub:v{backend}"


def config(env, lidarr=False):
    command = ["docker", "compose", "-f", str(COMPOSE)]
    if lidarr:
        command.extend(["-f", str(LIDARR_OVERRIDE)])
    command.extend(["config", "--format", "json"])
    return subprocess.run(
        command, cwd=ROOT, env=env, capture_output=True, text=True,
        check=False, timeout=30,
    )


def main():
    env = os.environ.copy()
    env.pop("MUSIC_PATH", None)
    env.pop("VERSION", None)
    env.pop("DOWNTIFY_LIDARR_STAGING_PATH", None)
    env["COMPOSE_PROJECT_NAME"] = "kima-ci-portable-install"

    # Docker Compose may omit explicit false booleans from its normalized
    # JSON model. Check the source contract as well as any emitted value.
    if "bind:\n          create_host_path: false" not in COMPOSE.read_text():
        raise AssertionError("Compose source must disable bind host-path creation")
    if "bind:\n          create_host_path: false" not in LIDARR_OVERRIDE.read_text():
        raise AssertionError("Optional Lidarr mount must disable host-path creation")

    for absent in (None, ""):
        candidate = env.copy()
        if absent is not None:
            candidate["MUSIC_PATH"] = absent
        result = config(candidate)
        if result.returncode == 0:
            raise AssertionError(
                "Compose must reject a missing or empty music path"
            )

    with tempfile.TemporaryDirectory(prefix="kima-compose-ci-") as work:
        music = Path(work) / "music"
        music.mkdir()
        candidate = env.copy()
        candidate["MUSIC_PATH"] = str(music)
        result = config(candidate)
        if result.returncode != 0:
            raise AssertionError(
                "Compose failed with a real staging directory (no details printed)"
            )
        data = json.loads(result.stdout)
        service = data["services"]["kima"]
        if service["image"] != checked_release_image():
            raise AssertionError("New install does not use fixed versioned release")

        music_volumes = [
            v for v in service["volumes"] if v["target"] == "/music"
        ]
        if len(music_volumes) != 1:
            raise AssertionError("Expected exactly one music bind mount")
        volume = music_volumes[0]
        if volume["type"] != "bind":
            raise AssertionError("Music volume type is not bind")
        if volume["source"] != str(music):
            raise AssertionError("Compose altered the configured music directory")
        # A normalized config can omit an explicitly false create_host_path.
        # Only a positive or non-boolean value is evidence of unsafe behavior.
        host_path_setting = volume.get("bind", {}).get("create_host_path")
        if host_path_setting not in (None, False):
            raise AssertionError("Compose enabled automatic host-path creation")

        # A non-existent *explicit* path may parse, but it must never be
        # auto-created by the Compose example's bind-mount semantics.
        missing = Path(work) / "not-mounted"
        candidate["MUSIC_PATH"] = str(missing)
        absent_result = config(candidate)
        if absent_result.returncode != 0 or missing.exists():
            raise AssertionError("Compose config created or rejected a harmless test path")
        absent_volume = next(
            v for v in json.loads(absent_result.stdout)["services"]["kima"]["volumes"]
            if v["target"] == "/music"
        )
        if absent_volume.get("bind", {}).get("create_host_path") not in (None, False):
            raise AssertionError("Absent music path could be created during startup")
        candidate["MUSIC_PATH"] = str(music)

        data_volumes = [
            v for v in service["volumes"] if v["target"] == "/data"
        ]
        if len(data_volumes) != 1 or data_volumes[0]["type"] != "volume":
            raise AssertionError("Persistent app-data volume is missing")
        if any(v["target"] == "/downloads" for v in service["volumes"]):
            raise AssertionError("Default Kima-only Compose must not require Lidarr staging")

        # The optional overlay is explicit; never silently invent a host
        # directory, bind /music as staging or modify existing /data mounts.
        for invalid in (None, ""):
            test_env = candidate.copy()
            if invalid is not None:
                test_env["DOWNTIFY_LIDARR_STAGING_PATH"] = invalid
            if config(test_env, lidarr=True).returncode == 0:
                raise AssertionError("Lidarr overlay accepted missing staging path")

        staging = Path(work) / "lidarr-stage"
        staging.mkdir()
        stage_env = candidate.copy()
        stage_env["DOWNTIFY_LIDARR_STAGING_PATH"] = str(staging)
        overlay_result = config(stage_env, lidarr=True)
        if overlay_result.returncode != 0:
            raise AssertionError("Explicit Lidarr staging overlay failed to parse")
        overlay_service = json.loads(overlay_result.stdout)["services"]["kima"]
        volumes = overlay_service["volumes"]
        if {v["target"] for v in volumes} != {"/music", "/data", "/downloads"}:
            raise AssertionError("Overlay unexpectedly changed the standard mounts")
        stage_mount = next(v for v in volumes if v["target"] == "/downloads")
        if stage_mount["type"] != "bind" or stage_mount["source"] != str(staging):
            raise AssertionError("Lidarr staging mount did not preserve host path")
        if stage_mount.get("bind", {}).get("create_host_path") not in (None, False):
            raise AssertionError("Lidarr staging mount may create missing host path")
        music_after = next(v for v in volumes if v["target"] == "/music")
        data_after = next(v for v in volumes if v["target"] == "/data")
        if music_after["source"] != str(music) or data_after != data_volumes[0]:
            raise AssertionError("Lidarr overlay changed the pre-existing library/data mounts")

        missing_stage = Path(work) / "missing-lidarr-stage"
        stage_env["DOWNTIFY_LIDARR_STAGING_PATH"] = str(missing_stage)
        absent_stage = config(stage_env, lidarr=True)
        if absent_stage.returncode != 0 or missing_stage.exists():
            raise AssertionError("Optional overlay created or rejected synthetic missing path")
        missing_mount = next(
            v for v in json.loads(absent_stage.stdout)["services"]["kima"]["volumes"]
            if v["target"] == "/downloads"
        )
        if missing_mount.get("bind", {}).get("create_host_path") not in (None, False):
            raise AssertionError("Absent Lidarr staging directory may be created by Docker")

        candidate["VERSION"] = "v1.18.0"
        result = config(candidate)
        if result.returncode != 0:
            raise AssertionError("Explicit pin unexpectedly failed")
        if json.loads(result.stdout)["services"]["kima"]["image"] != (
            "ghcr.io/oxygengs/kima-hub:v1.18.0"
        ):
            raise AssertionError("Explicitly pinned existing image was overridden")

    print("PASS: generic AIO Compose and opt-in Lidarr staging overlay "
          "preserve /music and /data, forbid implicit host-path creation, "
          "use fixed stable and honor explicit pins")


if __name__ == "__main__":
    main()
