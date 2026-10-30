import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  FreerapConfigError,
  freerapFetch,
  proxyFreerap,
} from '@/lib/freerap-client';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr } from '@/lib/resp';
import {
  wallpaperPeeperPollUrl,
  WallpaperPeeperRequestError,
} from '@/lib/wallpaper-peeper';

export async function GET({
  request,
  params,
}: {
  request: Request;
  params: { taskId: string };
}) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const rateLimit = enforceMinIntervalRateLimit(request, {
    intervalMs: 2_000,
    keyPrefix: 'wallpaper-peeper-poll',
    extraKey: session.user.id,
  });
  if (rateLimit) return rateLimit;

  try {
    const upstream = await freerapFetch(wallpaperPeeperPollUrl(params.taskId), {
      method: 'GET',
    });
    return proxyFreerap(upstream, 'Unable to load the video');
  } catch (error) {
    if (error instanceof WallpaperPeeperRequestError) {
      return respErr('Not found', { status: 404 });
    }
    if (error instanceof FreerapConfigError) {
      return respErr('Window Peeper is not configured.', { status: 503 });
    }
    console.error(
      'wallpaper-peeper poll failed',
      error instanceof Error ? error.name : 'Error'
    );
    return respErr('Unable to load the video', { status: 502 });
  }
}

export const Route = createFileRoute(
  '/api/wallpaper-peeper/generations/$taskId'
)({
  server: { handlers: { GET } },
});
