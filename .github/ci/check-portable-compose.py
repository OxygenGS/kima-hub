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
COMMAND = ["docker", "compose", "-f", str(COMPOSE), "config", "--format", "json"]


def config(env):
    return subprocess.run(
        COMMAND, cwd=ROOT, env=env, capture_output=True, text=True,
        check=False, timeout=30,
    )


def main():
    env = os.environ.copy()
    env.pop("MUSIC_PATH", None)
    env.pop("VERSION", None)
    env["COMPOSE_PROJECT_NAME"] = "kima-ci-portable-install"

    # Docker Compose may omit explicit false booleans from its normalized
    # JSON model. Check the source contract as well as any emitted value.
    if "bind:\n          create_host_path: false" not in COMPOSE.read_text():
        raise AssertionError("Compose source must disable bind host-path creation")

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
        if service["image"] != "ghcr.io/oxygengs/kima-hub:v1.19.0":
            raise AssertionError("New install does not use fixed published stable")

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

        candidate["VERSION"] = "v1.18.0"
        result = config(candidate)
        if result.returncode != 0:
            raise AssertionError("Explicit pin unexpectedly failed")
        if json.loads(result.stdout)["services"]["kima"]["image"] != (
            "ghcr.io/oxygengs/kima-hub:v1.18.0"
        ):
            raise AssertionError("Explicitly pinned existing image was overridden")

    print("PASS: generic AIO Compose install requires safe music path, "
          "disables auto-create, uses fixed stable and honors explicit pins")


if __name__ == "__main__":
    main()
