"""Start chatgpt2api after restoring the last R2 snapshot.

The snapshot interval is 15 seconds. A crash, SIGKILL, or failed upload keeps
the previous successful snapshot and drops newer local writes. SIGTERM tries
one more upload and exits non-zero when that upload fails.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from r2sync import BridgeClient, SyncFailed, prepare_state, sync_up

APP_DIR = Path(os.environ.get("CHATGPT2API_APP_DIR", "/app"))
CONFIG_PATH = APP_DIR / "config.json"
DATA_DIR = APP_DIR / "data"
SYNC_INTERVAL_SECONDS = int(os.environ.get("STATE_SYNC_INTERVAL_SECONDS", "15"))
PREFIX = "state"


def bridge_from_env() -> BridgeClient | None:
    secret = os.environ.get("STATE_BRIDGE_SECRET", "").strip()
    auth_key = os.environ.get("CHATGPT2API_AUTH_KEY", "").strip()
    if len(secret) < 32 or len(auth_key) < 32:
        return None
    base_url = os.environ.get("STATE_BRIDGE_URL", "http://state-bridge.internal").strip()
    return BridgeClient(base_url, secret)


def flush(store: BridgeClient) -> bool:
    try:
        sync_up([CONFIG_PATH, DATA_DIR], store, PREFIX, log=lambda message: print(message, file=sys.stderr))
    except SyncFailed:
        print("state flush failed; last successful snapshot kept", file=sys.stderr)
        return False
    return True


def main() -> int:
    store = bridge_from_env()
    if store is None:
        print("missing STATE_BRIDGE_SECRET or CHATGPT2API_AUTH_KEY", file=sys.stderr)
        return 2
    os.environ["STORAGE_BACKEND"] = "json"
    try:
        prepare_state(APP_DIR, store, PREFIX)
    except SyncFailed:
        print("state restore failed; not starting", file=sys.stderr)
        return 3
    command = [
        "uv",
        "run",
        "uvicorn",
        "main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "80",
        "--access-log",
    ]
    process = subprocess.Popen(command, cwd=APP_DIR)

    def stop(signum: int, _frame: object) -> None:
        ok = flush(store)
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
        raise SystemExit(0 if ok else 1)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while process.poll() is None:
        time.sleep(SYNC_INTERVAL_SECONDS)
        if process.poll() is None:
            flush(store)
    if not flush(store):
        return 1
    return process.returncode or 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
