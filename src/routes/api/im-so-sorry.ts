import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { createSorrySet, listSorrySets } from '@/modules/im-so-sorry/service';
import { SorryRequestError } from '@/lib/im-so-sorry';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit'));
    const sets = await listSorrySets(
      session.user.id,
      Number.isFinite(limitParam) ? limitParam : 12
    );
    return respData({ sets }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('im-so-sorry list failed', error);
    return respErr('Unable to load photo sets');
  }
}

async function POST({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const rateLimit = enforceMinIntervalRateLimit(request, {
    intervalMs: 5000,
    keyPrefix: 'im-so-sorry',
    extraKey: session.user.id,
  });
  if (rateLimit) return rateLimit;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createSorrySet({
      userId: session.user.id,
      photoUrl: body.photoUrl,
      styleId: body.styleId,
      lieIds: body.lieIds,
      costumeNote: body.costumeNote,
      captions: body.captions,
      locale: body.locale,
    });
    return respData(created, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SorryRequestError) {
      return respErr(error.message, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Insufficient credits') {
      return respErr('Insufficient credits', { status: 402 });
    }
    console.error('im-so-sorry create failed', error);
    return respErr('Unable to start the set', { status: 500 });
  }
}

export const Route = createFileRoute('/api/im-so-sorry')({
  server: { handlers: { GET, POST } },
});
