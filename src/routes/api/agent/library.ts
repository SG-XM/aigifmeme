import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { listGeneratedImages } from '@/modules/chats/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized');

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const page = await listGeneratedImages(session.user.id, {
    limit:
      Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });

  return respData({
    nextCursor: page.nextCursor,
    images: page.items.map((image) => ({
      id: image.id,
      src: image.src,
      name: image.name,
      alt: image.alt,
      chatId: image.chatId,
      chatTitle: image.chatTitle,
      createdAt: image.createdAt.toISOString(),
      model: image.model,
    })),
  });
}

export const Route = createFileRoute('/api/agent/library')({
  server: { handlers: { GET } },
});
