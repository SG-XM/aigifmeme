import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { refreshCreateVideo } from '@/modules/agent/tools';
import { listAllAiTasks } from '@/modules/ai-tasks/service';
import { hasPermission } from '@/modules/rbac/service';
import { respErr, respPage } from '@/lib/resp';

interface GenerationTask {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  mediaType: string;
  provider: string;
  model: string;
  prompt: string;
  status: string;
  taskId: string | null;
  options: string | null;
  createdAt: Date;
  costCredits: number;
  taskResult: string | null;
}

function isCreateTask(options: string | null): boolean {
  if (!options) return false;
  try {
    return JSON.parse(options).source === 'create';
  } catch {
    return false;
  }
}

async function GET({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    if (!isAdmin) return respErr('Forbidden');

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '20'))
    );
    const { items: resultItems, total } = await listAllAiTasks({
      page,
      pageSize,
      search: searchParams.get('search') || undefined,
    });
    const items = resultItems as GenerationTask[];

    // Reconcile only the processing Create videos on this page. The admin
    // list has no background poll, so each page load or manual refresh checks
    // each eligible upstream task once and persists any terminal result.
    const refreshedItems = await Promise.all(
      items.map(async (item) => {
        if (
          item.status !== 'processing' ||
          item.mediaType !== 'video' ||
          !isCreateTask(item.options)
        ) {
          return item;
        }
        try {
          const task = await refreshCreateVideo(item);
          return { ...item, status: task.status, taskResult: task.taskResult };
        } catch (error) {
          console.warn(`failed to refresh generation task ${item.id}:`, error);
          return item;
        }
      })
    );

    return respPage(
      refreshedItems.map((item) => ({
        id: item.id,
        userId: item.userId,
        userName: item.userName,
        userEmail: item.userEmail,
        mediaType: item.mediaType,
        provider: item.provider,
        model: item.model,
        prompt: item.prompt,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        costCredits: item.costCredits,
        taskResult: item.taskResult,
      })),
      total
    );
  } catch (error: any) {
    console.error('admin generations error:', error);
    return respErr(error.message || 'Failed to load generation history');
  }
}

export const Route = createFileRoute('/api/admin/generations')({
  server: { handlers: { GET } },
});
