import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  continueGifPack,
  GifPackError,
  regenerateSticker,
} from '@/modules/gif-pack/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function POST({
  request,
  params,
}: {
  request: Request;
  params: { id: string; stickerId: string };
}) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1500,
    keyPrefix: 'gif-pack-regen',
  });
  if (limited) return limited;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  try {
    const pack = await regenerateSticker(
      params.id,
      params.stickerId,
      session.user.id
    );
    if (!pack) return respErr('Not found', { status: 404 });
    continueGifPack(pack.id);
    return respData(pack);
  } catch (error) {
    if (error instanceof GifPackError)
      return respErr(error.message, { status: 400 });
    return respErr('Could not regenerate that sticker');
  }
}

export const Route = createFileRoute('/api/gif-packs/$id/stickers/$stickerId')({
  server: { handlers: { POST } },
});
