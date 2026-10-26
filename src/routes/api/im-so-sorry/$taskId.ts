import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { findTask } from '@/modules/ai-tasks/service';
import { refreshSorryTask, sorryTaskView } from '@/modules/im-so-sorry/service';
import { SORRY_SCENE } from '@/lib/im-so-sorry';
import { respData, respErr } from '@/lib/resp';

async function GET({
  request,
  params,
}: {
  request: Request;
  params: { taskId: string };
}) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const task = await findTask(params.taskId);
  if (
    !task ||
    task.userId !== session.user.id ||
    task.scene !== SORRY_SCENE ||
    task.deletedAt
  ) {
    return respErr('Not found', { status: 404 });
  }
  if (task.status === 'pending' || task.status === 'processing') {
    try {
      await refreshSorryTask(task.id);
    } catch (error) {
      console.error('im-so-sorry refresh failed', task.id, error);
    }
  }
  const fresh = (await findTask(task.id)) ?? task;
  return respData(sorryTaskView(fresh), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const Route = createFileRoute('/api/im-so-sorry/$taskId')({
  server: { handlers: { GET } },
});
