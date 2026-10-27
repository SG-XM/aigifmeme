import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { recordVisitorGeneration } from '@/modules/ab-tests/service';
import {
  createVideoProviderOverride,
  runVideoGeneration,
} from '@/modules/agent/tools';
import { getAllConfigs } from '@/modules/config/service';
import { getStorage } from '@/modules/storage/service';
import { AB_VISITOR_COOKIE } from '@/lib/ab-tests';
import type { AgentModelOptionValue } from '@/lib/agent-settings';
import { BULIN_REFERENCE_VIDEOS } from '@/lib/bulin-reference';
import {
  isTrioMediaVersion,
  TRIO_REFERENCE_VIDEOS,
} from '@/lib/bulin-trio-reference';
import { getCookieFromHeader } from '@/lib/cookie';
import { parseCreateVideoInput } from '@/lib/create-video';
import { getUuid } from '@/lib/hash';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { resolveCreateReferenceVideoUrl } from '@/lib/reference-video-config';
import { respData, respErr } from '@/lib/resp';
import { requireWindowPeeperReference } from '@/lib/window-peeper-reference';

export async function POST({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const rateLimit = enforceMinIntervalRateLimit(request, {
    intervalMs: 5000,
    keyPrefix: 'create-video',
    extraKey: session.user.id,
  });
  if (rateLimit) return rateLimit;
  try {
    const input = parseCreateVideoInput(await request.json());
    if (input.campaign === 'bridges') {
      return respErr(
        'Burning Bridges is retired. Its reference clip is not available for download, so this request was not submitted.'
      );
    }
    const storage = await getStorage();
    const publicUrl = storage?.getPublicUrl({ key: 'uploads/reference' });
    if (
      !publicUrl ||
      input.images.some(
        (url) => new URL(url).origin !== new URL(publicUrl).origin
      )
    ) {
      return respErr('Please upload your reference images through this site');
    }
    const configs = await getAllConfigs();
    const fallbackReferenceUrl = isTrioMediaVersion(input.referenceVideoVersion)
      ? TRIO_REFERENCE_VIDEOS[input.referenceVideoVersion].url
      : input.campaign === 'peeper'
        ? requireWindowPeeperReference().url
        : BULIN_REFERENCE_VIDEOS[
            input.referenceVideoVersion as 'from7s15s' | 'from4s15s'
          ].url;
    const referenceVideoUrl = resolveCreateReferenceVideoUrl({
      configs,
      referenceVideoVersion: input.referenceVideoVersion,
      fallbackUrl: fallbackReferenceUrl,
    });
    const result = JSON.parse(
      await runVideoGeneration({
        ctx: {
          userId: session.user.id,
          sessionId: `create-${getUuid()}`,
          settings: {
            ...input.settings,
            audioMode: 'silent' as const,
          },
          useSampleSoundtrack: true,
          soundtrackVersion: input.soundtrackVersion,
        },
        prompt: input.prompt,
        modelKey: input.settings.modelName as AgentModelOptionValue,
        kind: 'generate',
        providerOverride: createVideoProviderOverride(configs),
        options: {
          source: 'create',
          reference_image_urls: input.images,
          reference_video_urls: [referenceVideoUrl],
          referenceVideoVersion: input.referenceVideoVersion,
          aspect_ratio: input.settings.aspectRatio,
          resolution: input.settings.resolution,
          duration: input.settings.duration,
        },
        deferPolling: true,
      })
    );
    if (result.status === 'error' || result.status === 'canceled')
      return respErr(result.message || 'Unable to start video');
    const visitorId = getCookieFromHeader(
      request.headers.get('cookie'),
      AB_VISITOR_COOKIE
    );
    if (visitorId && input.campaign === 'bulin') {
      await recordVisitorGeneration(visitorId, session.user.id).catch(
        () => null
      );
    }
    return respData(result);
  } catch (error) {
    return respErr(
      error instanceof Error ? error.message : 'Unable to start video'
    );
  }
}

export const Route = createFileRoute('/api/agent/create')({
  server: { handlers: { POST } },
});
