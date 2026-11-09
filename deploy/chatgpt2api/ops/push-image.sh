#!/bin/sh
# Build the thin wrapper and push it to the Cloudflare registry.
# This must run on a machine with Docker. The parent deploy host does not have one.
set -eu
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not on this machine. Run ops/push-image.sh on GitHub Actions or another Docker host." >&2
  echo "After the push, put the printed digest into image-pin.json and wrangler.jsonc, then run npm run deploy on the parent host." >&2
  exit 1
fi

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-29a44cf6b1d2c5d00f51960def5bb48d}"
TAG="1.7.0-cf1"
LOCAL_IMAGE="chatgpt2api:${TAG}"

docker build --platform linux/amd64 -t "${LOCAL_IMAGE}" .
npx wrangler containers push "${LOCAL_IMAGE}"

REMOTE="registry.cloudflare.com/${ACCOUNT_ID}/chatgpt2api:${TAG}"
DIGEST="$(docker image inspect --format '{{index .RepoDigests 0}}' "${REMOTE}")"
echo "pinned image: ${DIGEST}"
echo "Write that value to image-pin.json cloudflare_image and the wrangler images.base.image field."

if [ "${WRITE_IMAGE_PIN:-}" = "1" ]; then
  python3 - "${DIGEST}" <<'PY'
import json
import pathlib
import sys
digest = sys.argv[1]
if "@sha256:" not in digest:
    raise SystemExit("push did not return a digest-pinned reference")
root = pathlib.Path.cwd()
pin_path = root / "image-pin.json"
pin = json.loads(pin_path.read_text())
pin["cloudflare_image"] = digest
pin_path.write_text(json.dumps(pin, indent=2) + "\n")
wrangler = root / "wrangler.jsonc"
text = wrangler.read_text()
needle = "registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:"
start = text.find(needle)
if start < 0:
    raise SystemExit("wrangler.jsonc is missing the image reference")
end = text.find('"', start)
text = text[:start] + digest + text[end:]
wrangler.write_text(text)
print("updated image pin files")
PY
fi
