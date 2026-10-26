import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getChatForShare } from '@/modules/chats/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

/**
 * Read-only conversation behind /share/<id>. Public chats are served to anyone
 * with the link; private ones only to the owner or an admin — everyone else
 * gets the same "not found" as a nonexistent id, so the response says nothing
 * about whether the chat exists.
 */
async function GET({
  request,
  params,
}: {
  request: Request;
  params: { chatId: string };
}) {
  try {
    const detail = await getChatForShare(params.chatId);
    if (!detail) return respErr('Chat not found');

    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    const viewerId = session?.user?.id;
    const privileged =
      !!viewerId &&
      (viewerId === detail.chat.userId ||
        (await hasPermission(viewerId, 'admin.*')));

    if (detail.chat.visibility !== 'public' && !privileged) {
      return respErr('Chat not found');
    }

    return respData({
      chat: {
        id: detail.chat.id,
        title: detail.chat.title,
        visibility: detail.chat.visibility,
        updatedAt: detail.chat.updatedAt.toISOString(),
      },
      messages: detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('share chat error:', error);
    return respErr(error.message || 'Failed to load chat');
  }
}

export const Route = createFileRoute('/api/share/$chatId')({
  server: { handlers: { GET } },
});
