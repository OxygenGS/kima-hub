"""No-network, disposable HTTP contract tests for the release-only probe."""
from __future__ import annotations

from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import downtify_staging_probe as probe

SERVER_ID = "a" * 32
SPOTIFY_ID = "A" * 22
TRACK_ID = "t0123456789abcdef"
TOKEN = "dtfy_staging_secret_never_print"
AUDIO = b"ID3" + bytes(range(256)) * 2  # 515 bytes, fake for HTTP-only tests


def fixture():
    return {
        "/api/server/info": {
            "server_id": SERVER_ID, "api_version": 1,
            "product": "Downtify", "require_sign_in": True,
        },
        "/api/auth/status": {
            "signed_in": True, "auth_disabled": False, "via": "device",
            "user": {"id": 5, "username": "test-operator", "role": "admin"},
        },
        "/api/queue": [{
            "status": "done", "user_ids": [5],
            "song": {"song_id": SPOTIFY_ID, "source": "spotify"},
            "filename": "synthetic.mp3",
        }],
        "/api/v1/library?since=0": {
            "cursor": 42, "full": True, "deleted": [],
            "tracks": [{
                "id": TRACK_ID, "file": "synthetic.mp3",
                "title": "Synthetic", "artist": "Test Artist",
                "duration": 12.0, "size": len(AUDIO),
            }],
        },
    }


class FakeDowntify(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.request_paths.append(self.path)
        if self.path != "/api/server/info":
            self.server.auth_headers.append(self.headers.get("Authorization"))
            if self.headers.get("Authorization") != "Bearer " + TOKEN:
                return self._reply(401, b"unauthorized", "text/plain")

        if self.path == "/api/v1/tracks/" + TRACK_ID + "/stream?format=original":
            if self.server.redirect_stream:
                self.send_response(302)
                self.send_header("Location", "http://example.invalid/secret")
                self.end_headers()
                return
            return self._reply(200, self.server.audio, "audio/mpeg")
        data = self.server.fixtures.get(self.path)
        if data is None:
            return self._reply(404, b"not found", "text/plain")
        return self._reply(200, json.dumps(data).encode(), "application/json")

    def _reply(self, status, body, mime):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class DowntifyStagingProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeDowntify)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def setUp(self):
        self.server.fixtures = fixture()
        self.server.audio = AUDIO
        self.server.redirect_stream = False
        self.server.request_paths = []
        self.server.auth_headers = []
        self.base = "http://127.0.0.1:" + str(self.server.server_port)

    def options(self, spotify_id="", full_audio=False, allow_http=True):
        return probe.Options(
            url=self.base, token=TOKEN, server_id=SERVER_ID,
            user_id=5, username="test-operator", spotify_id=spotify_id,
            full_audio=full_audio, allow_http=allow_http,
        )

    def fails(self, expected, opt):
        with self.assertRaises(probe.ProbeError) as ctx:
            probe.probe(opt)
        self.assertEqual(ctx.exception.code, expected)

    def test_read_only_identity_preflight_does_not_request_stream(self):
        result = probe.probe(self.options())
        self.assertEqual(result["state"], "source_identity_verified")
        self.assertEqual(result["source_audio"], "not_tested")
        self.assertFalse(result["release_approved"])
        self.assertTrue(result["read_only"])
        self.assertEqual(len(self.server.request_paths), 4)
        self.assertFalse(any("stream" in path for path in self.server.request_paths))

    def test_complete_source_hash_reads_original_without_writing(self):
        result = probe.probe(self.options(SPOTIFY_ID, full_audio=True))
        self.assertEqual(result["state"], "source_full_audio_verified")
        self.assertEqual(result["source_bytes"], len(AUDIO))
        self.assertEqual(result["source_sha256"], hashlib.sha256(AUDIO).hexdigest())
        self.assertIn("/stream?format=original", self.server.request_paths[-1])
        self.assertTrue(all(item == "Bearer " + TOKEN
                            for item in self.server.auth_headers))
        self.assertFalse(result["release_approved"])

    def test_wrong_server_id_fails_closed(self):
        self.server.fixtures["/api/server/info"]["server_id"] = "f" * 32
        self.fails("server_identity_mismatch", self.options())

    def test_wrong_account_fails_closed(self):
        self.server.fixtures["/api/auth/status"]["user"]["id"] = 7
        self.fails("paired_account_mismatch", self.options())

    def test_wrong_device_auth_fails_closed(self):
        self.server.fixtures["/api/auth/status"]["via"] = "session"
        self.fails("paired_account_mismatch", self.options())

    def test_completed_job_must_belong_to_paired_user(self):
        self.server.fixtures["/api/queue"][0]["user_ids"] = [7]
        self.fails("completed_job_not_unique", self.options(SPOTIFY_ID, True))

    def test_duplicate_completed_jobs_fail_closed(self):
        q = self.server.fixtures["/api/queue"]
        q.append(deepcopy(q[0]))
        self.fails("completed_job_not_unique", self.options(SPOTIFY_ID, True))

    def test_duplicate_library_row_fails_closed(self):
        rows = self.server.fixtures["/api/v1/library?since=0"]["tracks"]
        rows.append(deepcopy(rows[0]))
        self.fails("library_track_not_unique", self.options(SPOTIFY_ID, True))

    def test_redirect_does_not_leak_bearer_to_third_party(self):
        self.server.redirect_stream = True
        self.fails("original_stream_unavailable", self.options(SPOTIFY_ID, True))

    def test_mismatch_in_remote_stream_size_fails_closed(self):
        row = self.server.fixtures["/api/v1/library?since=0"]["tracks"][0]
        row["size"] = len(AUDIO) + 1
        self.fails("source_length_mismatch", self.options(SPOTIFY_ID, True))

    def test_no_implicit_plaintext_token_transmission(self):
        self.fails("plaintext_requires_explicit_opt_in",
                   self.options(allow_http=False))
        self.assertEqual(self.server.request_paths, [])

    def test_bad_or_missing_expected_spotify_identity_fails_closed(self):
        self.fails("invalid_input", self.options("invalid-id", True))
        self.fails("invalid_input", self.options("", True))

    def test_cli_error_redacts_url_token_and_filename(self):
        env = {
            "DOWNTIFY_STAGING_URL": self.base,
            "DOWNTIFY_STAGING_DEVICE_TOKEN": TOKEN,
            "DOWNTIFY_STAGING_SERVER_ID": "b" * 32,
            "DOWNTIFY_STAGING_USER_ID": "5",
            "DOWNTIFY_STAGING_USERNAME": "test-operator",
        }
        import sys as _sys
        output = StringIO()
        with patch.dict(os.environ, env), patch.object(_sys, "argv", [
            "downtify_staging_probe.py", "--allow-http",
        ]), redirect_stdout(output):
            status = probe.main()
        self.assertEqual(status, 1)
        printed = output.getvalue()
        self.assertNotIn(TOKEN, printed)
        self.assertNotIn(self.base, printed)
        self.assertNotIn("synthetic.mp3", printed)
        self.assertEqual(json.loads(printed)["reason"], "server_identity_mismatch")


if __name__ == "__main__":
    unittest.main()
