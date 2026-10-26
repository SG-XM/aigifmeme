import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { listChats } from '@/modules/chats/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized');

  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '20');

  const { items, total } = await listChats(session.user.id, {
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 20,
  });
  return respData({
    chats: items.map((c) => ({
      id: c.id,
      title: c.title,
      preview: c.preview,
      updatedAt: c.updatedAt.toISOString(),
    })),
    total,
  });
}

export const Route = createFileRoute('/api/agent/chats')({
  server: { handlers: { GET } },
});
