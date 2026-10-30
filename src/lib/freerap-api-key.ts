/**
 * FreeRap template API key. Server-only.
 * Workers: `wrangler secret put FREERAP_API_KEY` lands on the binding env
 * stashed as `__CF_ENV__` in `src/server.ts`. Node reads `process.env`.
 */
export function freerapApiKey(): string {
  const fromProcess = processEnvKey();
  if (fromProcess) return fromProcess;
  return cloudflareEnvKey();
}

function processEnvKey(): string {
  const env =
    typeof process !== 'undefined' && process.env ? process.env : undefined;
  const value = env?.FREERAP_API_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

function cloudflareEnvKey(): string {
  const host = globalThis as {
    __CF_ENV__?: { FREERAP_API_KEY?: unknown };
    __env__?: { FREERAP_API_KEY?: unknown };
  };
  const value =
    host.__CF_ENV__?.FREERAP_API_KEY ?? host.__env__?.FREERAP_API_KEY;
  return typeof value === 'string' ? value.trim() : '';
}
