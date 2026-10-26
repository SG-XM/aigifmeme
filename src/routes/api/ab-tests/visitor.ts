import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { assignVisitor, recordVisitorEvent } from '@/modules/ab-tests/service';
import { AB_VISITOR_COOKIE, isABMutationAllowed } from '@/lib/ab-tests';
import { getCookieFromHeader } from '@/lib/cookie';
import { getUuid } from '@/lib/hash';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr, respOk } from '@/lib/resp';

const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign') }),
  z.object({
    action: z.enum(['exposure', 'photo_selected', 'login_prompt', 'submit']),
    participantId: z.string().uuid(),
  }),
]);
async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request))
    return respErr('Forbidden', { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respErr('Invalid visitor event', { status: 400 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 100,
    keyPrefix: `ab-visitor-${parsed.data.action}`,
  });
  if (limited) return limited;
  const cookie = getCookieFromHeader(
    request.headers.get('cookie'),
    AB_VISITOR_COOKIE
  );
  const existingId = z.string().uuid().safeParse(cookie);
  const visitorId = existingId.success ? existingId.data : getUuid();
  try {
    if (parsed.data.action !== 'assign') {
      if (!existingId.success)
        return respErr('Invalid visitor', { status: 400 });
      await recordVisitorEvent(
        visitorId,
        parsed.data.participantId,
        parsed.data.action
      );
      return respOk({ headers: { 'Cache-Control': 'no-store' } });
    }
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    const assignment = await assignVisitor(visitorId, session?.user?.id);
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (assignment && !existingId.success) {
      const secure =
        new URL(request.url).protocol === 'https:' ? '; Secure' : '';
      headers['Set-Cookie'] =
        `${AB_VISITOR_COOKIE}=${visitorId}; Max-Age=7776000; Path=/; HttpOnly; SameSite=Lax${secure}`;
    }
    return respData(assignment, { headers });
  } catch {
    return respErr('Visitor experiment unavailable', { status: 503 });
  }
}
export const Route = createFileRoute('/api/ab-tests/visitor')({
  server: { handlers: { POST } },
});
