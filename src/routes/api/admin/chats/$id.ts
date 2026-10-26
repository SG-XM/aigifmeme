import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getChatForAdmin } from '@/modules/chats/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

/**
 * Any user's conversation, for the admin-only /share view. Same payload shape
 * as /api/agent/chat/$sessionId so the transcript renders identically, plus
 * the owner's name for the header.
 */
async function GET({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    if (!isAdmin) return respErr('Forbidden');

    const detail = await getChatForAdmin(params.id);
    if (!detail) return respErr('Chat not found');

    return respData({
      chat: {
        id: detail.chat.id,
        title: detail.chat.title,
        owner: detail.owner,
        updatedAt: detail.chat.updatedAt.toISOString(),
      },
      messages: detail.messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('admin chat detail error:', error);
    return respErr(error.message || 'Failed to load chat');
  }
}

export const Route = createFileRoute('/api/admin/chats/$id')({
  server: { handlers: { GET } },
});
