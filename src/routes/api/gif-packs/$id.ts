import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { deleteGifPack, packView } from '@/modules/gif-pack/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function actor(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    admin: await hasPermission(session.user.id, 'admin.*'),
  };
}

async function GET({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  const user = await actor(request);
  if (!user) return respErr('Unauthorized', { status: 401 });
  const pack = await packView(params.id, user.id, user.admin);
  if (!pack) return respErr('Not found', { status: 404 });
  return respData(pack);
}

async function DELETE({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  const user = await actor(request);
  if (!user) return respErr('Unauthorized', { status: 401 });
  const deleted = await deleteGifPack(params.id, user.id, user.admin);
  if (!deleted) return respErr('Not found', { status: 404 });
  return respData({ deleted: true });
}

export const Route = createFileRoute('/api/gif-packs/$id')({
  server: { handlers: { GET, DELETE } },
});
