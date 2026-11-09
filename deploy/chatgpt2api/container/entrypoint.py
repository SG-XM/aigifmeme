"""Start chatgpt2api after restoring R2 state, and flush state on SIGTERM."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from r2sync import R2Client, seed_config, sync_down, sync_up

APP_DIR = Path(os.environ.get("CHATGPT2API_APP_DIR", "/app"))
CONFIG_PATH = APP_DIR / "config.json"
DATA_DIR = APP_DIR / "data"
SYNC_INTERVAL_SECONDS = int(os.environ.get("STATE_SYNC_INTERVAL_SECONDS", "15"))
REQUIRED = (
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ACCOUNT_ID",
    "R2_BUCKET_NAME",
    "CHATGPT2API_AUTH_KEY",
)


def missing_names() -> list[str]:
    return [name for name in REQUIRED if not os.environ.get(name, "").strip()]


def restore_or_seed(client: R2Client, prefix: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    restored = sync_down(APP_DIR, client, prefix)
    config_key_present = any(key.endswith("/config.json") for key, _etag in client.list(prefix.strip("/") + "/"))
    if restored == 0 or not config_key_present:
        seed_config(CONFIG_PATH)
        sync_up([CONFIG_PATH, DATA_DIR], client, prefix, log=lambda message: print(message, file=sys.stderr))


def flush(client: R2Client, prefix: str) -> None:
    sync_up([CONFIG_PATH, DATA_DIR], client, prefix, log=lambda message: print(message, file=sys.stderr))


def main() -> int:
    missing = missing_names()
    if missing:
        print("missing required environment names: " + ",".join(missing), file=sys.stderr)
        return 2
    os.environ["STORAGE_BACKEND"] = "json"
    prefix = os.environ.get("R2_PREFIX", "state").strip() or "state"
    client = R2Client.from_env()
    restore_or_seed(client, prefix)
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
        flush(client, prefix)
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while process.poll() is None:
        time.sleep(SYNC_INTERVAL_SECONDS)
        if process.poll() is None:
            flush(client, prefix)
    flush(client, prefix)
    return process.returncode or 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
