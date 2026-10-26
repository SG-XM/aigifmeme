import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { recordExposure } from '@/modules/ab-tests/service';
import { isABMutationAllowed } from '@/lib/ab-tests';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr, respOk } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request))
    return respErr('Forbidden', { status: 403 });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 200,
    keyPrefix: 'ab-exposure',
    extraKey: session.user.id,
  });
  if (limited) return limited;
  const parsed = z
    .object({ participantId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respErr('Invalid participant', { status: 400 });
  try {
    await recordExposure(parsed.data.participantId, session.user.id);
    return respOk({ headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respErr('Exposure unavailable', { status: 400 });
  }
}
export const Route = createFileRoute('/api/ab-tests/exposure')({
  server: { handlers: { POST } },
});
