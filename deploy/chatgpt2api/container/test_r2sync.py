from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from r2sync import (
    BridgeClient,
    MissingObject,
    SyncFailed,
    object_key,
    prepare_state,
    seed_config,
    sync_down,
    sync_up,
)


class MemoryStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def get(self, key: str) -> bytes:
        if key not in self.objects:
            raise MissingObject(key)
        return self.objects[key]

    def put(self, key: str, body: bytes) -> None:
        self.objects[key] = body

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


class FailingStore(MemoryStore):
    def put(self, key: str, body: bytes) -> None:
        if key.endswith("config.json") and not key.endswith("_manifest.json"):
            raise SyncFailed("upload failed")
        super().put(key, body)


class R2SyncTest(unittest.TestCase):
    def test_config_survives_restart_and_logs_omit_values(self) -> None:
        logs: list[str] = []
        marker = "fixture-marker-value"
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = Path(first_dir)
            config = first / "config.json"
            data = first / "data"
            data.mkdir()
            config.write_text(json.dumps({"auth-key": marker, "base_url": "https://api.aigifmeme.com"}) + "\n", encoding="utf-8")
            (data / "accounts.json").write_text("[]\n", encoding="utf-8")
            store = MemoryStore()
            sync_up([config, data], store, "state", log=logs.append)

            second = Path(second_dir)
            restored = sync_down(second, store, "state")
            self.assertGreaterEqual(restored, 2)
            self.assertEqual(json.loads((second / "config.json").read_text(encoding="utf-8"))["auth-key"], marker)
            self.assertEqual((second / "data" / "accounts.json").read_text(encoding="utf-8"), "[]\n")

            (second / "config.json").write_text('{"auth-key":"changed","marker":1}\n', encoding="utf-8")
            (second / "data" / "accounts.json").unlink()
            sync_up([second / "config.json", second / "data"], store, "state", log=logs.append)
            third = Path(tempfile.mkdtemp())
            try:
                sync_down(third, store, "state")
                self.assertEqual(json.loads((third / "config.json").read_text(encoding="utf-8"))["marker"], 1)
                self.assertFalse((third / "data" / "accounts.json").exists())
            finally:
                import shutil

                shutil.rmtree(third)
        self.assertTrue(logs)
        self.assertNotIn(marker, "\n".join(logs))

    def test_failed_upload_keeps_the_previous_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = Path(first_dir)
            config = first / "config.json"
            data = first / "data"
            data.mkdir()
            config.write_text('{"marker":"old"}\n', encoding="utf-8")
            (data / "accounts.json").write_text("[]\n", encoding="utf-8")
            store = MemoryStore()
            sync_up([config, data], store, "state")
            saved = dict(store.objects)
            config.write_text('{"marker":"new"}\n', encoding="utf-8")
            (data / "accounts.json").unlink()
            failing = FailingStore()
            failing.objects = dict(saved)
            with self.assertRaises(SyncFailed):
                sync_up([config, data], failing, "state")
            self.assertEqual(failing.objects["state/config.json"], saved["state/config.json"])
            self.assertIn("state/data/accounts.json", failing.objects)
            restored = Path(second_dir)
            sync_down(restored, failing, "state")
            self.assertEqual(json.loads((restored / "config.json").read_text(encoding="utf-8"))["marker"], "old")
            self.assertTrue((restored / "data" / "accounts.json").is_file())

    def test_seed_and_prepare_do_not_start_from_a_failed_restore(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory)
            (app / "config.json").write_text('{"auth-key":"chatgpt2api"}\n', encoding="utf-8")
            store = MemoryStore()
            store.objects["state/_manifest.json"] = b'{"state/config.json":"not-a-real-hash"}'
            store.objects["state/config.json"] = b"{}"
            with self.assertRaises(SyncFailed):
                prepare_state(app, store, "state")
            self.assertNotIn("state/_manifest.json", store.objects.keys() - {"state/_manifest.json", "state/config.json"})

    def test_seed_disables_clearance_and_drops_published_auth_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(
                json.dumps(
                    {
                        "auth-key": "chatgpt2api",
                        "proxy_runtime": {"enabled": True, "clearance": {"enabled": True, "mode": "flaresolverr"}},
                        "backup": {"enabled": True, "secret_access_key": "keep-me-out"},
                    }
                ),
                encoding="utf-8",
            )
            seed_config(path)
            loaded = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(loaded["auth-key"], "")
            self.assertFalse(loaded["proxy_runtime"]["enabled"])
            self.assertFalse(loaded["proxy_runtime"]["clearance"]["enabled"])
            self.assertEqual(loaded["proxy_runtime"]["clearance"]["mode"], "none")
            self.assertFalse(loaded["backup"]["enabled"])
            self.assertEqual(loaded["backup"]["secret_access_key"], "")

    def test_unsafe_keys_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            object_key("state", "../config.json")

    def test_bridge_client_sends_the_secret_only_in_the_header(self) -> None:
        bridge_value = "bridge-header-value-0123456789abcdef"
        seen: list[tuple[str, str, str]] = []

        class Handler(BaseHTTPRequestHandler):
            def _read(self) -> bytes:
                length = int(self.headers.get("Content-Length", "0"))
                return self.rfile.read(length) if length else b""

            def _finish(self, code: int, body: bytes = b"{}") -> None:
                seen.append((self.command, self.path, self.headers.get("Authorization", "")))
                self.send_response(code)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:
                if self.path == "/v1/manifest":
                    self._finish(404, b'{"missing":true}')
                    return
                self._finish(200, b"hello")

            def do_PUT(self) -> None:
                self._read()
                self._finish(200, b'{"ok":true}')

            def do_DELETE(self) -> None:
                self._finish(200, b'{"ok":true}')

            def log_message(self, _format: str, *_args: object) -> None:
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            port = server.server_address[1]
            client = BridgeClient(f"http://127.0.0.1:{port}", bridge_value)
            with self.assertRaises(MissingObject):
                client.get("state/_manifest.json")
            client.put("state/config.json", b"{}")
            self.assertEqual(client.get("state/config.json"), b"hello")
        finally:
            server.shutdown()
        self.assertTrue(seen)
        for method, path, authorization in seen:
            self.assertNotIn(bridge_value, path)
            self.assertEqual(authorization, f"Bearer {bridge_value}")
            self.assertIn(method, {"GET", "PUT", "DELETE"})
        with self.assertRaises(SyncFailed):
            BridgeClient(f"http://127.0.0.1/path?token={bridge_value}", bridge_value)


if __name__ == "__main__":
    unittest.main()
