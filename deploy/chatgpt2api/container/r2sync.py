"""Snapshot chatgpt2api files through the Worker R2 bridge.

This is not a per-write backend. Upstream v1.7.0 writes config.json and the
JSON account files locally. A snapshot runs every 15 seconds and on SIGTERM.
Writes after the last successful snapshot are not durable. The manifest is
updated only after every changed object upload succeeds, and old objects are
deleted only after that manifest write. A failed upload leaves the previous
snapshot in place.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Callable, Iterable, Protocol
from urllib.parse import quote, urlsplit
from urllib.request import Request

MAX_OBJECT_BYTES = 64 * 1024 * 1024
SKIP_DIR_NAMES = {"git_cache", "__pycache__", ".git"}
MANIFEST_NAME = "_manifest.json"


class MissingObject(Exception):
    pass


class SyncFailed(Exception):
    pass


class ObjectStore(Protocol):
    def get(self, key: str) -> bytes: ...

    def put(self, key: str, body: bytes) -> None: ...

    def delete(self, key: str) -> None: ...


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def object_key(prefix: str, relative: str) -> str:
    clean = relative.replace("\\", "/").lstrip("/")
    if clean == "" or clean.startswith("../") or "/../" in f"/{clean}" or clean == "..":
        raise ValueError("unsafe object path")
    base = prefix.strip("/")
    return f"{base}/{clean}" if base else clean


def iter_files(roots: Iterable[Path]) -> list[tuple[str, Path]]:
    found: list[tuple[str, Path]] = []
    for root in roots:
        if root.is_file():
            found.append((root.name, root))
            continue
        if not root.exists():
            continue
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            if any(part in SKIP_DIR_NAMES for part in path.relative_to(root).parts):
                continue
            if path.name.endswith(".tmp") or path.name.endswith(".swp"):
                continue
            relative = f"{root.name}/{path.relative_to(root).as_posix()}"
            found.append((relative, path))
    return found


def _manifest_key(prefix: str) -> str:
    return object_key(prefix, MANIFEST_NAME)


def load_manifest(store: ObjectStore, prefix: str) -> dict[str, str] | None:
    try:
        raw = store.get(_manifest_key(prefix))
    except MissingObject:
        return None
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SyncFailed("manifest is not json") from exc
    if not isinstance(loaded, dict):
        raise SyncFailed("manifest is not an object")
    return {str(key): str(value) for key, value in loaded.items()}


def sync_up(
    roots: Iterable[Path],
    store: ObjectStore,
    prefix: str,
    log: Callable[[str], None] = print,
) -> dict[str, int]:
    local_keys = {object_key(prefix, relative): path for relative, path in iter_files(roots)}
    previous = load_manifest(store, prefix) or {}
    current: dict[str, str] = {}
    pending: list[tuple[str, bytes]] = []
    skipped = 0
    for key, path in local_keys.items():
        size = path.stat().st_size
        if size > MAX_OBJECT_BYTES:
            skipped += 1
            log(f"skip large file bytes={size}")
            if key in previous:
                current[key] = previous[key]
            continue
        body = path.read_bytes()
        if len(body) != size:
            skipped += 1
            log("skip file that changed while reading")
            if key in previous:
                current[key] = previous[key]
            continue
        digest = _sha256(body)
        current[key] = digest
        if previous.get(key) == digest:
            continue
        pending.append((key, body))
    for key, body in pending:
        store.put(key, body)
    uploaded = len(pending)
    encoded = json.dumps(current, sort_keys=True).encode("utf-8")
    previous_encoded = json.dumps(previous, sort_keys=True).encode("utf-8")
    if encoded != previous_encoded or uploaded:
        store.put(_manifest_key(prefix), encoded)
    deleted = 0
    for key in previous:
        if key not in current and key != _manifest_key(prefix):
            try:
                store.delete(key)
                deleted += 1
            except Exception:
                log("delete failed after manifest commit")
    log(f"sync up uploaded={uploaded} deleted={deleted} skipped={skipped}")
    return {"uploaded": uploaded, "deleted": deleted, "skipped": skipped}


def _safe_relative(relative: str) -> bool:
    return relative != "" and not relative.startswith("../") and "/../" not in f"/{relative}" and relative != ".."


def sync_down(destination: Path, store: ObjectStore, prefix: str) -> int:
    manifest = load_manifest(store, prefix)
    if manifest is None:
        return 0
    destination.mkdir(parents=True, exist_ok=True)
    base = prefix.strip("/") + "/"
    count = 0
    for key, digest in manifest.items():
        if not key.startswith(base) or not _safe_relative(key[len(base) :]):
            raise SyncFailed("manifest key is outside the snapshot")
        try:
            body = store.get(key)
        except MissingObject as exc:
            raise SyncFailed("snapshot object missing") from exc
        if _sha256(body) != digest:
            raise SyncFailed("snapshot hash mismatch")
        target = destination / key[len(base) :]
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".partial")
        temporary.write_bytes(body)
        os.replace(temporary, target)
        count += 1
    return count


def seed_config(path: Path) -> None:
    """First-boot config: empty auth key, clearance off, upstream backup off."""
    raw: dict[str, object] = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                raw = loaded
        except json.JSONDecodeError:
            raw = {}
    raw["auth-key"] = ""
    runtime = raw.get("proxy_runtime")
    if not isinstance(runtime, dict):
        runtime = {}
    runtime["enabled"] = False
    clearance = runtime.get("clearance")
    if not isinstance(clearance, dict):
        clearance = {}
    clearance["enabled"] = False
    clearance["mode"] = "none"
    clearance["cf_cookies"] = ""
    clearance["cf_clearance"] = ""
    clearance["warm_up_on_start"] = False
    runtime["clearance"] = clearance
    raw["proxy_runtime"] = runtime
    backup = raw.get("backup")
    if not isinstance(backup, dict):
        backup = {}
    backup["enabled"] = False
    backup["access_key_id"] = ""
    backup["secret_access_key"] = ""
    backup["passphrase"] = ""
    raw["backup"] = backup
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prepare_state(app_dir: Path, store: ObjectStore, prefix: str) -> None:
    config_path = app_dir / "config.json"
    data_dir = app_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    if load_manifest(store, prefix) is None:
        seed_config(config_path)
        sync_up([config_path, data_dir], store, prefix)
        return
    sync_down(app_dir, store, prefix)


class BridgeClient:
    def __init__(self, base_url: str, secret: str, opener: Callable[..., object] | None = None) -> None:
        parts = urlsplit(base_url)
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            raise SyncFailed("bridge url is invalid")
        if secret and secret in base_url:
            raise SyncFailed("bridge url contains the secret")
        if len(secret) < 32:
            raise SyncFailed("bridge secret is too short")
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.opener = opener

    def _call(self, method: str, path: str, body: bytes | None = None) -> bytes:
        import urllib.error
        import urllib.request

        request = Request(
            self.base_url + path,
            data=body if method != "GET" else None,
            method=method,
            headers={"Authorization": f"Bearer {self.secret}"},
        )
        opener = self.opener or urllib.request.urlopen
        try:
            with opener(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise MissingObject(path) from None
            if exc.code == 401:
                raise SyncFailed("bridge rejected authentication") from None
            raise SyncFailed(f"bridge {method} status={exc.code}") from None

    def get(self, key: str) -> bytes:
        if key.endswith("/" + MANIFEST_NAME):
            return self._call("GET", "/v1/manifest")
        return self._call("GET", "/v1/object?key=" + quote(key, safe=""))

    def put(self, key: str, body: bytes) -> None:
        if key.endswith("/" + MANIFEST_NAME):
            self._call("PUT", "/v1/manifest", body)
            return
        self._call("PUT", "/v1/object?key=" + quote(key, safe=""), body)

    def delete(self, key: str) -> None:
        self._call("DELETE", "/v1/object?key=" + quote(key, safe=""))
