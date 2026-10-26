import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { listAllChats } from '@/modules/chats/service';
import { hasPermission } from '@/modules/rbac/service';
import { respErr, respPage } from '@/lib/resp';

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

    const { items, total } = await listAllChats({
      page,
      pageSize,
      search: searchParams.get('search') || undefined,
    });

    return respPage(
      items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      total
    );
  } catch (error: any) {
    console.error('admin chats error:', error);
    return respErr(error.message || 'Failed to load chats');
  }
}

export const Route = createFileRoute('/api/admin/chats')({
  server: { handlers: { GET } },
});
