import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getActiveTasksForSession } from '@/modules/ai-tasks/service';
import {
  deleteChat,
  getChatWithMessages,
  renameChat,
} from '@/modules/chats/service';
import { respData, respErr, respOk } from '@/lib/resp';

type Ctx = { request: Request; params: { sessionId: string } };

async function requireUser(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

async function GET({ request, params }: Ctx) {
  const user = await requireUser(request);
  if (!user) return respErr('Unauthorized');

  const [detail, activeTasks] = await Promise.all([
    getChatWithMessages(params.sessionId, user.id),
    getActiveTasksForSession({
      userId: user.id,
      sessionId: params.sessionId,
    }),
  ]);
  if (!detail) {
    // Fresh session that hasn't been persisted yet — let the UI start blank.
    return respData({
      chat: null,
      messages: [],
      run: { active: activeTasks.length > 0 },
    });
  }

  const interruptedResult = JSON.stringify({
    status: 'interrupted',
    message: 'Generation was interrupted before a final result was recorded.',
  });
  const hasActiveRun = activeTasks.length > 0;

  return respData({
    chat: {
      id: detail.chat.id,
      title: detail.chat.title,
      updatedAt: detail.chat.updatedAt.toISOString(),
    },
    messages: detail.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: hasActiveRun
        ? m.parts
        : m.parts.map((part) =>
            part.type === 'tool_call' &&
            part.result === undefined &&
            (part.name === 'generate_video' || part.name === 'animate_image')
              ? { ...part, result: interruptedResult }
              : part
          ),
      createdAt: m.createdAt.toISOString(),
    })),
    run: { active: hasActiveRun },
  });
}

async function PATCH({ request, params }: Ctx) {
  const user = await requireUser(request);
  if (!user) return respErr('Unauthorized');

  let body: { title?: string };
  try {
    body = (await request.json()) as { title?: string };
  } catch {
    return respErr('Invalid JSON');
  }
  const title = (body?.title ?? '').trim();
  if (!title) return respErr('title is required');

  await renameChat(params.sessionId, user.id, title);
  return respOk();
}

async function DELETE({ request, params }: Ctx) {
  const user = await requireUser(request);
  if (!user) return respErr('Unauthorized');

  await deleteChat(params.sessionId, user.id);
  return respOk();
}

export const Route = createFileRoute('/api/agent/chat/$sessionId')({
  server: { handlers: { GET, PATCH, DELETE } },
});
