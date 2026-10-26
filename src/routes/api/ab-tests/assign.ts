import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { assignParticipant } from '@/modules/ab-tests/service';
import { isABMutationAllowed } from '@/lib/ab-tests';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request))
    return respErr('Forbidden', { status: 403 });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 200,
    keyPrefix: 'ab-assign',
    extraKey: session.user.id,
  });
  if (limited) return limited;
  const parsed = z
    .object({ scene: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respErr('Invalid scene', { status: 400 });
  try {
    return respData(
      await assignParticipant(parsed.data.scene, session.user.id),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('A/B assignment failed', error);
    return respErr('Assignment unavailable', { status: 503 });
  }
}
export const Route = createFileRoute('/api/ab-tests/assign')({
  server: { handlers: { POST } },
});
