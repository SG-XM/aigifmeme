import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getStorage } from '@/modules/storage/service';
import {
  assertDameHombroHosted,
  buildDameHombroCreateBody,
  dameHombroCreateUrl,
  DameHombroRequestError,
  readDameHombroCreateInput,
} from '@/lib/dame-hombro';
import {
  FreerapConfigError,
  freerapFetch,
  proxyFreerap,
} from '@/lib/freerap-client';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr } from '@/lib/resp';

/**
 * Signed-in, same as `/api/im-so-sorry` and the public upload route.
 * Anonymous create would spend the server FreeRap key. This route does not
 * charge Uptown credits.
 */
async function POST({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const rateLimit = enforceMinIntervalRateLimit(request, {
    intervalMs: 10_000,
    keyPrefix: 'dame-hombro',
    extraKey: session.user.id,
  });
  if (rateLimit) return rateLimit;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respErr('Invalid request', { status: 400 });
  }

  try {
    const input = readDameHombroCreateInput(payload);
    const body = buildDameHombroCreateBody(input);
    const storage = await getStorage();
    const sample = storage?.getPublicUrl({ key: 'uploads/reference' });
    if (!storage || !sample) {
      return respErr(
        'Public storage is not configured. Configure Storage in Admin Settings before adding reference media.',
        { status: 503 }
      );
    }
    assertDameHombroHosted(body, sample);
    const upstream = await freerapFetch(dameHombroCreateUrl(), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return proxyFreerap(upstream, 'Unable to start the video');
  } catch (error) {
    if (error instanceof DameHombroRequestError) {
      return respErr(error.message, { status: 400 });
    }
    if (error instanceof FreerapConfigError) {
      return respErr('Dame Hombro is not configured.', { status: 503 });
    }
    console.error(
      'dame-hombro create failed',
      error instanceof Error ? error.name : 'Error'
    );
    return respErr('Unable to start the video', { status: 502 });
  }
}

export const Route = createFileRoute('/api/dame-hombro')({
  server: { handlers: { POST } },
});

export { POST };
