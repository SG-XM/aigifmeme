import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getStorage } from '@/modules/storage/service';
import {
  FreerapConfigError,
  freerapFetch,
  proxyFreerap,
} from '@/lib/freerap-client';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr } from '@/lib/resp';
import {
  assertWallpaperPeeperHosted,
  buildWallpaperPeeperCreateBody,
  wallpaperPeeperCreateUrl,
  WallpaperPeeperRequestError,
} from '@/lib/wallpaper-peeper';

/**
 * Signed-in, same as `/api/dame-hombro`. Anonymous create would spend the
 * server FreeRap key. This route does not charge Uptown credits.
 */
export async function POST({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const rateLimit = enforceMinIntervalRateLimit(request, {
    intervalMs: 10_000,
    keyPrefix: 'wallpaper-peeper',
    extraKey: session.user.id,
  });
  if (rateLimit) return rateLimit;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respErr('Invalid JSON', { status: 400 });
  }

  try {
    const body = buildWallpaperPeeperCreateBody(payload);
    const storage = await getStorage();
    const sample = storage?.getPublicUrl({ key: 'uploads/reference' });
    if (!storage || !sample) {
      return respErr(
        'Public storage is not configured. Configure Storage in Admin Settings before adding reference media.',
        { status: 503 }
      );
    }
    assertWallpaperPeeperHosted(body, sample);
    const upstream = await freerapFetch(wallpaperPeeperCreateUrl(), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return proxyFreerap(upstream, 'Unable to start the video');
  } catch (error) {
    if (error instanceof WallpaperPeeperRequestError) {
      return respErr(error.message, { status: error.status });
    }
    if (error instanceof FreerapConfigError) {
      return respErr('Window Peeper is not configured.', { status: 503 });
    }
    console.error(
      'wallpaper-peeper create failed',
      error instanceof Error ? error.name : 'Error'
    );
    return respErr('Unable to start the video', { status: 502 });
  }
}

export const Route = createFileRoute('/api/wallpaper-peeper/generations')({
  server: { handlers: { POST } },
});
