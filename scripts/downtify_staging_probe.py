#!/usr/bin/env python3
"""Read-only Downtify API release probe. No Kima/database/filesystem mutations.

This tool deliberately proves ONLY source-side compatibility and byte
transport. A real Kima import, scanner receipt, playback, and backup restore
are separate mandatory release gates. Never print credentials or source paths.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import re
import ssl
import sys
from dataclasses import dataclass
from urllib.parse import urlsplit

MAX_JSON = 16 * 1024 * 1024
MAX_AUDIO = 256 * 1024 * 1024
TRACK_ID = re.compile(r"^t[0-9a-f]{16}$")
SPOTIFY_ID = re.compile(r"^[A-Za-z0-9]{22}$")
SERVER_ID = re.compile(r"^[0-9a-f]{32}$")


class ProbeError(Exception):
    """An intentionally sanitized, machine-readable reason."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Options:
    url: str
    token: str
    server_id: str
    user_id: int
    username: str
    spotify_id: str
    full_audio: bool
    allow_http: bool


class Source:
    def __init__(self, options: Options):
        parsed = urlsplit(options.url)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname
                or parsed.username or parsed.password or parsed.path not in ("", "/")
                or parsed.query or parsed.fragment):
            raise ProbeError("invalid_base_url")
        if parsed.scheme == "http" and not options.allow_http:
            raise ProbeError("plaintext_requires_explicit_opt_in")
        try:
            port = parsed.port
        except ValueError:
            raise ProbeError("invalid_base_url") from None
        self.scheme = parsed.scheme
        self.host = parsed.hostname
        self.port = port or (443 if parsed.scheme == "https" else 80)
        self.token = options.token

    def _connection(self):
        if self.scheme == "https":
            return http.client.HTTPSConnection(
                self.host, self.port, timeout=20, context=ssl.create_default_context()
            )
        return http.client.HTTPConnection(self.host, self.port, timeout=20)

    def request(self, path: str, authenticated: bool):
        if not path.startswith("/") or not path.startswith("/api/"):
            raise ProbeError("invalid_endpoint")
        conn = self._connection()
        try:
            headers = {
                "Accept": "application/json" if not path.endswith(
                    "/stream?format=original"
                ) else "audio/*, application/octet-stream",
                "Accept-Encoding": "identity",
                "Connection": "close",
                "User-Agent": "Kima-ReadOnly-Release-Probe/1",
            }
            if authenticated:
                headers["Authorization"] = "Bearer " + self.token
            conn.request("GET", path, headers=headers)
            response = conn.getresponse()
            return conn, response
        except (OSError, ssl.SSLError, http.client.HTTPException):
            conn.close()
            raise ProbeError("source_unreachable") from None

    def json(self, path: str, authenticated: bool, limit: int):
        conn, response = self.request(path, authenticated)
        try:
            if response.status in (401, 403):
                raise ProbeError("unauthorized")
            if response.status != 200:
                raise ProbeError("source_http_error")
            if response.getheader("Content-Encoding", "identity").lower() != "identity":
                raise ProbeError("unexpected_encoding")
            raw = response.read(limit + 1)
            if len(raw) > limit:
                raise ProbeError("source_response_too_large")
            try:
                return json.loads(raw)
            except (UnicodeDecodeError, ValueError):
                raise ProbeError("invalid_source_json") from None
        except (OSError, http.client.HTTPException):
            raise ProbeError("source_unreachable") from None
        finally:
            conn.close()

    def hash_original(self, track_id: str, expected_bytes: int):
        # No file is created. Read at most the independently supplied byte count.
        conn, response = self.request(
            "/api/v1/tracks/" + track_id + "/stream?format=original", True
        )
        try:
            if response.status in (401, 403):
                raise ProbeError("unauthorized")
            if response.status != 200:
                raise ProbeError("original_stream_unavailable")
            if response.getheader("Content-Encoding", "identity").lower() != "identity":
                raise ProbeError("unexpected_encoding")
            content_type = response.getheader("Content-Type", "").split(";")[0].strip()
            if not (content_type.startswith("audio/")
                    or content_type == "application/octet-stream"):
                raise ProbeError("unexpected_audio_type")
            length = response.getheader("Content-Length", "")
            if not length.isdecimal() or int(length) != expected_bytes:
                raise ProbeError("source_length_mismatch")
            if not (64 <= expected_bytes <= MAX_AUDIO):
                raise ProbeError("source_size_out_of_bounds")
            digest = hashlib.sha256()
            remaining = expected_bytes
            while remaining:
                chunk = response.read(min(65536, remaining))
                if not chunk:
                    raise ProbeError("truncated_source_audio")
                digest.update(chunk)
                remaining -= len(chunk)
            if response.read(1):
                raise ProbeError("oversized_source_audio")
            return digest.hexdigest()
        except (OSError, http.client.HTTPException):
            raise ProbeError("source_unreachable") from None
        finally:
            conn.close()


def probe(options: Options) -> dict:
    if (not SERVER_ID.fullmatch(options.server_id)
            or not isinstance(options.user_id, int) or options.user_id <= 0
            or not options.username.strip() or len(options.username) > 128
            or not options.token or any(c in options.token for c in "\r\n")
            or (options.spotify_id and not SPOTIFY_ID.fullmatch(options.spotify_id))
            or (options.full_audio and not options.spotify_id)):
        raise ProbeError("invalid_input")

    source = Source(options)
    server = source.json("/api/server/info", False, 16 * 1024)
    if (not isinstance(server, dict) or server.get("product") != "Downtify"
            or server.get("api_version") != 1
            or server.get("require_sign_in") is not True
            or server.get("server_id") != options.server_id):
        raise ProbeError("server_identity_mismatch")

    auth = source.json("/api/auth/status", True, 16 * 1024)
    user = auth.get("user") if isinstance(auth, dict) else None
    if (not isinstance(user, dict) or auth.get("signed_in") is not True
            or auth.get("via") != "device"
            or auth.get("auth_disabled") is not False
            or user.get("id") != options.user_id
            or not isinstance(user.get("username"), str)
            or user["username"].casefold() != options.username.casefold()):
        raise ProbeError("paired_account_mismatch")

    queue = source.json("/api/queue", True, 3 * 1024 * 1024)
    if not isinstance(queue, list) or len(queue) > 10000:
        raise ProbeError("invalid_queue")

    library = source.json("/api/v1/library?since=0", True, MAX_JSON)
    if (not isinstance(library, dict) or library.get("full") is not True
            or not isinstance(library.get("tracks"), list)
            or not isinstance(library.get("cursor"), int)
            or not isinstance(library.get("deleted"), list)):
        raise ProbeError("invalid_library_feed")
    if not options.spotify_id:
        return {
            "state": "source_identity_verified",
            "source_audio": "not_tested",
            "release_approved": False,
            "read_only": True,
        }

    matched = [
        row for row in queue if isinstance(row, dict)
        and row.get("status") == "done"
        and isinstance(row.get("song"), dict)
        and row["song"].get("song_id") == options.spotify_id
        and row["song"].get("source", "spotify") == "spotify"
        and isinstance(row.get("user_ids"), list)
        and options.user_id in row["user_ids"]
    ]
    if len(matched) != 1 or not isinstance(matched[0].get("filename"), str):
        raise ProbeError("completed_job_not_unique")
    filename = matched[0]["filename"]
    files = [
        track for track in library["tracks"]
        if isinstance(track, dict) and track.get("file") == filename
    ]
    if len(files) != 1:
        raise ProbeError("library_track_not_unique")
    track = files[0]
    size = track.get("size")
    if (not isinstance(track.get("id"), str)
            or not TRACK_ID.fullmatch(track["id"])
            or not isinstance(size, int) or isinstance(size, bool)
            or not 64 <= size <= MAX_AUDIO
            or not isinstance(track.get("duration"), (float, int))
            or isinstance(track.get("duration"), bool)
            or not 1 <= track["duration"] <= 86400):
        raise ProbeError("invalid_track_metadata")

    if not options.full_audio:
        return {
            "state": "source_job_verified",
            "source_audio": "not_tested",
            "release_approved": False,
            "read_only": True,
        }

    digest = source.hash_original(track["id"], size)
    return {
        "state": "source_full_audio_read",
        "source_audio": "sha256_computed",
        "source_bytes": size,
        "source_sha256": digest,
        "release_approved": False,
        "read_only": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read-only Downtify release evidence, not a music importer."
    )
    parser.add_argument("--full-audio", action="store_true",
                        help="stream entire selected original into SHA-256; save no file")
    parser.add_argument("--allow-http", action="store_true",
                        help="allow plaintext token only on an operator-trusted test network")
    args = parser.parse_args()
    try:
        options = Options(
            url=os.environ.get("DOWNTIFY_STAGING_URL", ""),
            token=os.environ.get("DOWNTIFY_STAGING_DEVICE_TOKEN", ""),
            server_id=os.environ.get("DOWNTIFY_STAGING_SERVER_ID", ""),
            user_id=int(os.environ.get("DOWNTIFY_STAGING_USER_ID", "0")),
            username=os.environ.get("DOWNTIFY_STAGING_USERNAME", ""),
            spotify_id=os.environ.get("DOWNTIFY_STAGING_SPOTIFY_ID", ""),
            full_audio=args.full_audio,
            allow_http=args.allow_http,
        )
        result = probe(options)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ProbeError, ValueError) as exc:
        reason = exc.code if isinstance(exc, ProbeError) else "invalid_input"
        # Never echo URL, device token, remote filename, or raw HTTP errors.
        print(json.dumps({"state": "failed", "reason": reason,
                          "release_approved": False, "read_only": True}))
        return 1
    except Exception:
        # Fail closed, without accidentally emitting remote data.
        print(json.dumps({"state": "failed", "reason": "unexpected_probe_failure",
                          "release_approved": False, "read_only": True}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
