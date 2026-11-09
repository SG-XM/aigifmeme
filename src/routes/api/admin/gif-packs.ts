import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  GifPackError,
  listAdminDemos,
  listAdminRecords,
  listThemes,
  publishThemeVersion,
} from '@/modules/gif-pack/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function requireAdmin(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.id, 'admin.*'))) {
    return respErr('Forbidden', { status: 403 });
  }
  return null;
}

async function GET({ request }: { request: Request }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const kind = new URL(request.url).searchParams.get('view') || 'records';
  if (kind === 'themes') return respData(await listThemes());
  if (kind === 'demos') return respData(await listAdminDemos());
  return respData(await listAdminRecords());
}

async function POST({ request }: { request: Request }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const theme = await publishThemeVersion(body);
    return respData(theme);
  } catch (error) {
    if (error instanceof GifPackError)
      return respErr(error.message, { status: 400 });
    return respErr('Could not publish the theme');
  }
}

export const Route = createFileRoute('/api/admin/gif-packs')({
  server: { handlers: { GET, POST } },
});
