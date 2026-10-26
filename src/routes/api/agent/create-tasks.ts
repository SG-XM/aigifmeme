import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { refreshCreateVideo } from '@/modules/agent/tools';
import { getCreateTasks } from '@/modules/ai-tasks/service';
import {
  isBulinMediaVersion,
  type BulinMediaVersion,
} from '@/lib/bulin-reference';
import {
  isTrioMediaVersion,
  type TrioMediaVersion,
} from '@/lib/bulin-trio-reference';
import {
  isBurningBridgesMediaVersion,
  type BurningBridgesMediaVersion,
} from '@/lib/burning-bridges-reference';
import { respData, respErr } from '@/lib/resp';
import {
  isWindowPeeperMediaVersion,
  type WindowPeeperMediaVersion,
} from '@/lib/window-peeper-reference';

export async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit'));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), 100)
        : 20;
    const activeOnly = url.searchParams.get('activeOnly') === 'true';
    const rows = await getCreateTasks(session.user.id, {
      limit,
      cursor: url.searchParams.get('cursor') ?? undefined,
      activeOnly,
    });
    const tasks = await Promise.all(
      rows.map(async (row) => {
        const task = await refreshCreateVideo(row).catch(() => row);
        let result: { files?: unknown; error?: string } = {};
        try {
          result = JSON.parse(task.taskResult || '{}');
        } catch {
          /* Old task records may lack results. */
        }
        let imagePreview: string | undefined;
        let referenceVideoVersion:
          | BulinMediaVersion
          | BurningBridgesMediaVersion
          | TrioMediaVersion
          | WindowPeeperMediaVersion
          | undefined;
        let soundtrackVersion:
          | BulinMediaVersion
          | BurningBridgesMediaVersion
          | TrioMediaVersion
          | WindowPeeperMediaVersion
          | undefined;
        try {
          const options = JSON.parse(task.options || '{}') as {
            image_input?: unknown;
            reference_image_urls?: unknown;
            referenceVideoVersion?: unknown;
            soundtrackVersion?: unknown;
          };
          if (isBulinMediaVersion(options.referenceVideoVersion))
            referenceVideoVersion = options.referenceVideoVersion;
          else if (isBurningBridgesMediaVersion(options.referenceVideoVersion))
            referenceVideoVersion = options.referenceVideoVersion;
          else if (isTrioMediaVersion(options.referenceVideoVersion))
            referenceVideoVersion = options.referenceVideoVersion;
          else if (isWindowPeeperMediaVersion(options.referenceVideoVersion))
            referenceVideoVersion = options.referenceVideoVersion;
          if (isBulinMediaVersion(options.soundtrackVersion))
            soundtrackVersion = options.soundtrackVersion;
          else if (isBurningBridgesMediaVersion(options.soundtrackVersion))
            soundtrackVersion = options.soundtrackVersion;
          else if (isTrioMediaVersion(options.soundtrackVersion))
            soundtrackVersion = options.soundtrackVersion;
          const images = Array.isArray(options.image_input)
            ? options.image_input
            : options.reference_image_urls;
          const candidate = Array.isArray(images) ? images[0] : undefined;
          if (typeof candidate === 'string') {
            const parsed = new URL(candidate);
            if (parsed.protocol === 'https:') imagePreview = candidate;
          }
        } catch {
          /* Old task records may not contain parseable options. */
        }
        return {
          id: task.id,
          status: task.status,
          prompt: task.prompt,
          model: task.model,
          costCredits: task.costCredits,
          createdAt: task.createdAt.toISOString(),
          files: Array.isArray(result.files)
            ? result.files.filter(
                (file): file is string => typeof file === 'string'
              )
            : [],
          imagePreview,
          referenceVideoVersion,
          soundtrackVersion,
          error: result.error,
        };
      })
    );
    const last = rows[rows.length - 1];
    return respData(
      {
        tasks,
        nextCursor:
          rows.length === limit && last
            ? `${last.createdAt.getTime()}:${last.id}`
            : undefined,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return respErr('Unable to load video tasks');
  }
}

export const Route = createFileRoute('/api/agent/create-tasks')({
  server: { handlers: { GET } },
});
