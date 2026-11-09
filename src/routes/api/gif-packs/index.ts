import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  continueGifPack,
  createGifPack,
  GifPackError,
  listGifPacks,
} from '@/modules/gif-pack/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function userId(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

async function GET({ request }: { request: Request }) {
  const id = await userId(request);
  if (!id) return respErr('Unauthorized', { status: 401 });
  return respData(await listGifPacks(id));
}

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1500,
    keyPrefix: 'gif-pack-create',
  });
  if (limited) return limited;
  const id = await userId(request);
  if (!id) return respErr('Unauthorized', { status: 401 });
  try {
    const body = (await request.json()) as Record<string, string>;
    const pack = await createGifPack({
      userId: id,
      uploadId: body.uploadId,
      themeId: body.themeId,
      style: body.style,
      motionMode: body.motionMode,
      background: body.background,
      language: body.language,
      idempotencyKey: body.idempotencyKey,
    });
    if (!pack) return respErr('Could not start the pack');
    continueGifPack(pack.id);
    return respData(pack);
  } catch (error) {
    if (error instanceof GifPackError)
      return respErr(error.message, { status: 400 });
    return respErr('Could not start the pack');
  }
}

export const Route = createFileRoute('/api/gif-packs/')({
  server: { handlers: { GET, POST } },
});
