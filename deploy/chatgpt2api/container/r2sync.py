"""Whole-file sync between the upstream data directory and an R2 bucket.

Cloudflare Containers can mount R2 with FUSE. The Containers docs describe that
mount as object storage, not a POSIX disk: renames, locks, and crash behavior
do not match a local filesystem. chatgpt2api v1.7.0 stores config and the
account pool with Path.write_text, so this adapter uploads finished file bytes
and restores them before the process starts.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Protocol
from urllib.parse import quote
from xml.etree import ElementTree

MAX_OBJECT_BYTES = 64 * 1024 * 1024
SKIP_DIR_NAMES = {"git_cache", "__pycache__", ".git"}


class ObjectStore(Protocol):
    def list(self, prefix: str) -> list[tuple[str, str]]: ...

    def get(self, key: str) -> bytes: ...

    def put(self, key: str, body: bytes) -> None: ...

    def delete(self, key: str) -> None: ...


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def signing_key(secret: str, datestamp: str, region: str, service: str) -> bytes:
    key = _sign(("AWS4" + secret).encode("utf-8"), datestamp)
    key = _sign(key, region)
    key = _sign(key, service)
    return _sign(key, "aws4_request")


def _aws_encode(value: str, safe: str = "") -> str:
    return quote(value, safe=safe)


def authorization_header(
    *,
    method: str,
    host: str,
    canonical_uri: str,
    canonical_query: str,
    payload: bytes,
    access_key: str,
    secret_key: str,
    region: str,
    service: str,
    amz_date: str,
    content_type: str | None = None,
    include_content_hash_header: bool = True,
) -> tuple[str, str]:
    payload_hash = _sha256(payload)
    header_map = {
        "host": host,
        "x-amz-date": amz_date,
    }
    if include_content_hash_header:
        header_map["x-amz-content-sha256"] = payload_hash
    if content_type:
        header_map["content-type"] = content_type
    signed_names = sorted(header_map)
    canonical_headers = "".join(f"{name}:{header_map[name].strip()}\n" for name in signed_names)
    signed_headers = ";".join(signed_names)
    canonical_request = "\n".join(
        [
            method,
            canonical_uri,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    datestamp = amz_date[:8]
    scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            _sha256(canonical_request.encode("utf-8")),
        ]
    )
    signature = hmac.new(
        signing_key(secret_key, datestamp, region, service),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    header = (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )
    return header, payload_hash


@dataclass
class R2Client:
    account_id: str
    bucket: str
    access_key: str
    secret_key: str
    opener: Callable[..., object] | None = None

    @classmethod
    def from_env(cls) -> "R2Client":
        return cls(
            account_id=os.environ["R2_ACCOUNT_ID"],
            bucket=os.environ["R2_BUCKET_NAME"],
            access_key=os.environ["R2_ACCESS_KEY_ID"],
            secret_key=os.environ["R2_SECRET_ACCESS_KEY"],
        )

    @property
    def host(self) -> str:
        return f"{self.account_id}.r2.cloudflarestorage.com"

    def _request(self, method: str, key: str, query: str, body: bytes) -> bytes:
        import urllib.error
        import urllib.request

        canonical_uri = "/" + _aws_encode(key, safe="/") if key else "/"
        amz_date = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        content_type = "application/octet-stream" if method == "PUT" else None
        authorization, payload_hash = authorization_header(
            method=method,
            host=self.host,
            canonical_uri=canonical_uri,
            canonical_query=query,
            payload=body,
            access_key=self.access_key,
            secret_key=self.secret_key,
            region="auto",
            service="s3",
            amz_date=amz_date,
            content_type=content_type,
        )
        url = f"https://{self.host}{canonical_uri}"
        if query:
            url = f"{url}?{query}"
        headers = {
            "Host": self.host,
            "Authorization": authorization,
            "x-amz-date": amz_date,
            "x-amz-content-sha256": payload_hash,
        }
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(url, data=body if method != "GET" else None, headers=headers, method=method)
        opener = self.opener or urllib.request.urlopen
        try:
            with opener(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            lowered = detail.lower()
            if any(word in lowered for word in ("signature", "secret", "aws4", "authorization")):
                detail = "response omitted"
            raise RuntimeError(f"r2 {method} failed status={exc.code} key={key or '/'} detail={detail[:180]}") from None

    def list(self, prefix: str) -> list[tuple[str, str]]:
        items: list[tuple[str, str]] = []
        token = ""
        while True:
            query = f"list-type=2&prefix={_aws_encode(prefix)}"
            if token:
                query += f"&continuation-token={_aws_encode(token)}"
            payload = self._request("GET", "", query, b"")
            root = ElementTree.fromstring(payload)
            ns = ""
            if root.tag.startswith("{"):
                ns = root.tag.split("}", 1)[0] + "}"
            for node in root.findall(f"{ns}Contents"):
                key = node.findtext(f"{ns}Key") or ""
                etag = (node.findtext(f"{ns}ETag") or "").strip('"')
                if key:
                    items.append((key, etag))
            truncated = (root.findtext(f"{ns}IsTruncated") or "").lower() == "true"
            token = root.findtext(f"{ns}NextContinuationToken") or ""
            if not truncated or not token:
                return items

    def get(self, key: str) -> bytes:
        return self._request("GET", key, "", b"")

    def put(self, key: str, body: bytes) -> None:
        self._request("PUT", key, "", body)

    def delete(self, key: str) -> None:
        self._request("DELETE", key, "", b"")


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


MANIFEST_NAME = "_manifest.json"


def _load_manifest(store: ObjectStore, manifest_key: str) -> dict[str, str]:
    try:
        loaded = json.loads(store.get(manifest_key))
    except Exception:
        return {}
    if not isinstance(loaded, dict):
        return {}
    return {str(key): str(value) for key, value in loaded.items()}


def sync_up(
    roots: Iterable[Path],
    store: ObjectStore,
    prefix: str,
    log: Callable[[str], None] = print,
) -> dict[str, int]:
    local = iter_files(roots)
    local_keys = {object_key(prefix, relative): path for relative, path in local}
    manifest_key = object_key(prefix, MANIFEST_NAME)
    previous = _load_manifest(store, manifest_key)
    current: dict[str, str] = {}
    uploaded = 0
    skipped = 0
    deleted = 0
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
        store.put(key, body)
        uploaded += 1
    for key in previous:
        if key not in current and key != manifest_key:
            store.delete(key)
            deleted += 1
    if uploaded or deleted or current != previous:
        store.put(manifest_key, json.dumps(current, sort_keys=True).encode("utf-8"))
    log(f"sync up uploaded={uploaded} deleted={deleted} skipped={skipped}")
    return {"uploaded": uploaded, "deleted": deleted, "skipped": skipped}


def sync_down(destination: Path, store: ObjectStore, prefix: str) -> int:
    destination.mkdir(parents=True, exist_ok=True)
    count = 0
    base = prefix.strip("/") + "/"
    for key, _etag in store.list(base):
        if not key.startswith(base):
            continue
        relative = key[len(base) :]
        if relative == "" or relative == MANIFEST_NAME or relative.startswith("../") or "/../" in f"/{relative}":
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        body = store.get(key)
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(body)
        os.replace(temporary, target)
        count += 1
    return count


def seed_config(path: Path) -> None:
    """First-boot config: empty account pool, no clearance, no upstream backup secrets."""
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
