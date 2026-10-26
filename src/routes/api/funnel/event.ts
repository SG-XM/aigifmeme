import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { AB_VISITOR_COOKIE } from '@/lib/ab-tests';
import { getCookieFromHeader } from '@/lib/cookie';
import { recordFunnelEvent } from '@/lib/funnel';
import {
  FUNNEL_CHECKOUT_EVENTS,
  sanitizeFunnelMetadata,
} from '@/lib/funnel-events';
import { getUuid } from '@/lib/hash';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr, respOk } from '@/lib/resp';

const input = z.object({
  event: z.enum([
    'photo_selected',
    'paywall_shown',
    'identify',
    ...FUNNEL_CHECKOUT_EVENTS,
  ]),
  productId: z.string().max(64).optional(),
  priceInCents: z.number().optional(),
  currency: z.string().max(3).optional(),
  placement: z.string().max(64).optional(),
  provider: z.string().max(32).optional(),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(500).optional(),
});

async function POST({ request }: { request: Request }) {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== new URL(request.url).origin)
  ) {
    return respErr('Forbidden', { status: 403 });
  }

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respErr('Invalid funnel event', { status: 400 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 100,
    keyPrefix: `funnel-${parsed.data.event}`,
  });
  if (limited) return limited;

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (parsed.data.event === 'identify' && !session?.user)
    return respErr('Unauthorized', { status: 401 });

  const existingVisitorId = getCookieFromHeader(
    request.headers.get('cookie'),
    AB_VISITOR_COOKIE
  );
  const parsedVisitorId = z.string().uuid().safeParse(existingVisitorId);
  const visitorId = parsedVisitorId.success ? parsedVisitorId.data : getUuid();
  const eventName =
    parsed.data.event === 'identify' ? 'authenticated' : parsed.data.event;
  const metadata = sanitizeFunnelMetadata({
    ...parsed.data,
    source: FUNNEL_CHECKOUT_EVENTS.includes(
      parsed.data.event as (typeof FUNNEL_CHECKOUT_EVENTS)[number]
    )
      ? 'client'
      : undefined,
  });

  try {
    await recordFunnelEvent(eventName, visitorId, session?.user.id, metadata);
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
    };
    if (!parsedVisitorId.success) {
      const secure =
        new URL(request.url).protocol === 'https:' ? '; Secure' : '';
      headers['Set-Cookie'] =
        `${AB_VISITOR_COOKIE}=${visitorId}; Max-Age=7776000; Path=/; HttpOnly; SameSite=Lax${secure}`;
    }
    return respOk({ headers });
  } catch {
    // Funnel collection must never affect the user's product flow.
    return respOk({ headers: { 'Cache-Control': 'no-store' } });
  }
}

export const Route = createFileRoute('/api/funnel/event')({
  server: { handlers: { POST } },
});
