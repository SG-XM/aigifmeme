#!/bin/sh
set -eu

if [ ! -f .env.production ]; then
  echo "cf:deploy requires .env.production with the production VITE_APP_URL." >&2
  exit 1
fi

if [ ! -f wrangler.jsonc ]; then
  echo "cf:deploy requires wrangler.jsonc. Copy wrangler.example.jsonc and configure it first." >&2
  exit 1
fi

set -a
. ./.env.production
set +a

case "${VITE_APP_URL:-}" in
  https://*) ;;
  *)
    echo "VITE_APP_URL in .env.production must be an https URL." >&2
    exit 1
    ;;
esac

case "$VITE_APP_URL" in
  *localhost*|*127.0.0.1*|*'<'*|*'>'*)
    echo "VITE_APP_URL in .env.production cannot be localhost or a placeholder URL." >&2
    exit 1
    ;;
esac

node - "$VITE_APP_URL" <<'NODE'
const fs = require('node:fs');
const expectedUrl = process.argv[2];
const config = fs.readFileSync('wrangler.jsonc', 'utf8');
const match = config.match(/"VITE_APP_URL"\s*:\s*"([^"]*)"/);

if (!match) {
  console.error('wrangler.jsonc must define vars.VITE_APP_URL.');
  process.exit(1);
}

if (match[1] !== expectedUrl) {
  console.error('VITE_APP_URL must match between .env.production and wrangler.jsonc.');
  process.exit(1);
}

if (!match[1].startsWith('https://') || /localhost|127\.0\.0\.1|[<>]/.test(match[1])) {
  console.error('vars.VITE_APP_URL in wrangler.jsonc must be a production https URL, not localhost or a placeholder.');
  process.exit(1);
}
NODE

# Vite 8 keeps an already-set NODE_ENV (the production default applies only
# when it is unset) and sets oxc.jsx.development from that value.
# @vitejs/plugin-react leaves the flag unset, so an ambient
# NODE_ENV=development compiles the SSR bundle to react/jsx-dev-runtime
# (jsxDEV). Production workerd then throws "jsxDEV is not a function" on
# every SSR page. Override after sourcing .env.production so a NODE_ENV
# line in that file cannot reintroduce the development runtime.
export NODE_ENV=production

# caches.default survives deploys and this token cannot Zone.Cache Purge.
# A new id on every production build moves the marketing HTML cache key
# (src/lib/marketing-html-cache.ts) after Vite rotates asset hashes.
# Set it after sourcing .env.production so a pinned value there cannot
# reuse the previous document. `pnpm cf:build` still generates an id when
# this is unset.
GIT_SHA=$(git rev-parse --short=12 HEAD 2>/dev/null || printf '%s' nogit)
export MARKETING_HTML_CACHE_BUILD_ID="${GIT_SHA}-$(date -u +%Y%m%dT%H%M%SZ)"
echo "marketing html cache build id: ${MARKETING_HTML_CACHE_BUILD_ID}"

pnpm cf:build
exec wrangler deploy
