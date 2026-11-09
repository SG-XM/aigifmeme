from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from r2sync import authorization_header, object_key, seed_config, sync_down, sync_up


class MemoryStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def list(self, prefix: str) -> list[tuple[str, str]]:
        import hashlib

        return [
            (key, hashlib.sha256(body).hexdigest())
            for key, body in sorted(self.objects.items())
            if key.startswith(prefix)
        ]

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def put(self, key: str, body: bytes) -> None:
        self.objects[key] = body

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


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
            (data / "nested").mkdir()
            (data / "nested" / "note.json").write_text('{"ok":true}\n', encoding="utf-8")
            store = MemoryStore()
            sync_up([config, data], store, "state", log=logs.append)

            second = Path(second_dir)
            restored = sync_down(second, store, "state")
            self.assertGreaterEqual(restored, 3)
            self.assertEqual(
                json.loads((second / "config.json").read_text(encoding="utf-8"))["auth-key"],
                marker,
            )
            self.assertEqual((second / "data" / "accounts.json").read_text(encoding="utf-8"), "[]\n")
            self.assertTrue((second / "data" / "nested" / "note.json").is_file())

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

    def test_sigv4_matches_the_published_iam_example(self) -> None:
        header, payload_hash = authorization_header(
            method="GET",
            host="iam.amazonaws.com",
            canonical_uri="/",
            canonical_query="Action=ListUsers&Version=2010-05-08",
            payload=b"",
            access_key="AKIDEXAMPLE",
            secret_key="wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            region="us-east-1",
            service="iam",
            amz_date="20150830T123600Z",
            content_type="application/x-www-form-urlencoded; charset=utf-8",
            include_content_hash_header=False,
        )
        self.assertEqual(payload_hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        self.assertIn(
            "Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
            header,
        )


if __name__ == "__main__":
    unittest.main()
