import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { cancelVideoGenerationsForSession } from '@/modules/agent/tools';
import { cancelPendingToolCalls, findChat } from '@/modules/chats/service';
import { isAgentSessionId } from '@/lib/agent';
import { respData, respErr } from '@/lib/resp';

type Ctx = { request: Request; params: { sessionId: string } };

async function POST({ request, params }: Ctx) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized');
  if (!isAgentSessionId(params.sessionId)) {
    return respErr('invalid sessionId');
  }

  const ownedChat = await findChat(params.sessionId, session.user.id);
  if (!ownedChat) return respErr('Chat not found');

  const [tasks, toolCalls] = await Promise.all([
    cancelVideoGenerationsForSession({
      userId: session.user.id,
      sessionId: params.sessionId,
    }),
    cancelPendingToolCalls(params.sessionId, session.user.id),
  ]);

  return respData({ ...tasks, toolCalls });
}

export const Route = createFileRoute('/api/agent/chat/$sessionId/stop')({
  server: { handlers: { POST } },
});
