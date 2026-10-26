import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getDbConfigs } from '@/modules/config/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';

// Endpoints worth slowing down: each one either creates an account or sends
// mail, so a burst is never a real person. The per-IP daily signup cap in
// `core/auth/signup-guard` is the durable limit; this only blunts bursts,
// since the store lives in one Worker isolate's memory.
const THROTTLED = [
  '/sign-up/email',
  '/sign-in/email',
  '/forget-password',
  '/send-verification-email',
];

// better-auth catch-all — the handler takes a standard Request and
// returns a standard Response, so it mounts directly.
async function handle(request: Request) {
  if (request.method === 'POST') {
    const { pathname } = new URL(request.url);
    if (THROTTLED.some((path) => pathname.endsWith(path))) {
      const limited = enforceMinIntervalRateLimit(request, {
        intervalMs: 2000,
        keyPrefix: 'auth',
      });
      if (limited) return limited;
    }
  }

  const configs = await getDbConfigs();
  const auth = getAuth(configs);
  return auth.handler(request);
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
