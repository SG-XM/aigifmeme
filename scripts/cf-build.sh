#!/bin/sh
# Workers production build. Each run gets a new marketing HTML cache key so
# caches.default cannot keep serving a document whose Vite asset hashes 404.
# The source file is restored on the way out, including when vite build fails.
# See src/lib/marketing-html-cache.ts.
set -eu

# Same Node 22 gate as cf-deploy.sh. `pnpm cf:deploy` reaches this script via
# `pnpm cf:build`; a direct `pnpm cf:build` on Node 20 must also stop first.
node_version=$(node -v 2>/dev/null || true)
node_major=$(printf '%s' "$node_version" | tr -d 'vV' | cut -d. -f1)
case "$node_major" in
  ''|*[!0-9]*)
    echo "cf:build requires Node.js 22 or newer (Vite 8). Current: ${node_version:-node not found}. Use Node 22+ and retry." >&2
    exit 1
    ;;
esac
if [ "$node_major" -lt 22 ]; then
  echo "cf:build requires Node.js 22 or newer (Vite 8). Current: ${node_version}. Use Node 22+ and retry." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

node scripts/write-marketing-html-cache-build-id.mjs
trap 'node scripts/write-marketing-html-cache-build-id.mjs --reset || true' EXIT

# Vite 8 keeps an already-set NODE_ENV and compiles the SSR bundle to
# react/jsx-dev-runtime when it is "development". Production workerd then
# throws "jsxDEV is not a function". cf:deploy.sh sets this too; repeat it
# so `pnpm cf:build` alone stays on the production runtime.
export NODE_ENV=production
export NITRO_PRESET=cloudflare_module

export PATH="$PWD/node_modules/.bin:$PATH"
vite build
