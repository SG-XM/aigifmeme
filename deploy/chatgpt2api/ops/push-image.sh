#!/bin/sh
# Build the thin Go wrapper and push it to the Cloudflare registry.
# Uses docker + wrangler containers push if docker is available, or Go OCI push (ops/oci-push) otherwise.
# Wrangler / oci-push uses CLOUDFLARE_API_TOKEN already present in the environment.
set -eu
cd "$(dirname "$0")/.."

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-29a44cf6b1d2c5d00f51960def5bb48d}"
TAG="2.0.0-cf1"
BASE_IMAGE="ghcr.io/basketikun/chatgpt2api@sha256:dfa33c149fded5bf65cbbe301f72d1a7bac414691a5df00a7b24a5acad6a5dc0"
REMOTE="registry.cloudflare.com/${ACCOUNT_ID}/chatgpt2api:${TAG}"

if command -v docker >/dev/null 2>&1; then
  LOCAL_IMAGE="chatgpt2api:${TAG}"
  docker build --platform linux/amd64 -t "${LOCAL_IMAGE}" .
  npx wrangler containers push "${LOCAL_IMAGE}"
  DIGEST="$(docker image inspect --format '{{index .RepoDigests 0}}' "${REMOTE}")"
elif command -v go >/dev/null 2>&1; then
  DIGEST="$(cd ops/oci-push && go run . --base "${BASE_IMAGE}" --target "${REMOTE}" --account "${ACCOUNT_ID}" --root "../..")"
else
  echo "Neither docker nor go is available on PATH." >&2
  exit 1
fi

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
