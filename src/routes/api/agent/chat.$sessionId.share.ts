import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  findChat,
  setChatVisibility,
  type ChatVisibility,
} from '@/modules/chats/service';
import { respData, respErr } from '@/lib/resp';

type Ctx = { request: Request; params: { sessionId: string } };

// Owner-only share settings: read or flip whether /share/<id> is public.
async function requireOwnedChat(request: Request, sessionId: string) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { error: respErr('Unauthorized') } as const;
  const chat = await findChat(sessionId, session.user.id);
  if (!chat) return { error: respErr('Chat not found') } as const;
  return { userId: session.user.id, chat } as const;
}

async function GET({ request, params }: Ctx) {
  const owned = await requireOwnedChat(request, params.sessionId);
  if ('error' in owned) return owned.error;
  return respData({
    visibility: (owned.chat.visibility as ChatVisibility) || 'private',
  });
}

async function POST({ request, params }: Ctx) {
  const owned = await requireOwnedChat(request, params.sessionId);
  if ('error' in owned) return owned.error;

  const body = await request.json().catch(() => ({}));
  const visibility = body?.visibility;
  if (visibility !== 'private' && visibility !== 'public') {
    return respErr('Invalid visibility');
  }

  await setChatVisibility(params.sessionId, owned.userId, visibility);
  return respData({ visibility });
}

export const Route = createFileRoute('/api/agent/chat/$sessionId/share')({
  server: { handlers: { GET, POST } },
});
