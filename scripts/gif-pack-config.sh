#!/bin/sh
# Sets or removes GIF pack worker secrets. The key is read from a file and is not printed.
# Usage:
#   sh scripts/gif-pack-config.sh apply /path/to/credential-file
#   sh scripts/gif-pack-config.sh delete
set -eu

action="${1:-}"
key_file="${2:-}"

put_secret() {
  name="$1"
  value="$2"
  printf '%s' "$value" | npx wrangler secret put "$name" >/dev/null
  printf 'set %s\n' "$name"
}

case "$action" in
  apply)
    if [ -z "$key_file" ] || [ ! -f "$key_file" ]; then
      echo "Pass the credential file path. Example: sh scripts/gif-pack-config.sh apply /path/to/key" >&2
      exit 1
    fi
    key="$(tr -d '\r\n' < "$key_file")"
    if [ "${#key}" -lt 8 ]; then
      echo "Credential file is too short to be a bearer token." >&2
      exit 1
    fi
    put_secret GIF_PACK_BASE_URL "https://api.aigifmeme.com/v1"
    put_secret GIF_PACK_API_KEY "$key"
    put_secret GIF_PACK_IMAGE_MODEL "gpt-image-2"
    unset key
    echo "Worker secrets saved. Admin fields gif_pack_base_url, gif_pack_api_key, and gif_pack_image_model override them."
    ;;
  delete)
    npx wrangler secret delete GIF_PACK_API_KEY || true
    npx wrangler secret delete GIF_PACK_BASE_URL || true
    npx wrangler secret delete GIF_PACK_IMAGE_MODEL || true
    echo "Worker secrets removed. Delete config.gif_pack_api_key in D1 if an admin value was saved."
    ;;
  *)
    echo "Usage: sh scripts/gif-pack-config.sh apply /path/to/credential-file | delete" >&2
    exit 1
    ;;
esac
