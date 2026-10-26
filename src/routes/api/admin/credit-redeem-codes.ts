import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  createBatch,
  invalidateCode,
  listCodes,
} from '@/modules/credit-redeem-codes/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr, respOk, respPage } from '@/lib/resp';

async function getAdmin(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new Error('Unauthorized');
  if (!(await hasPermission(session.user.id, 'admin.*')))
    throw new Error('Forbidden');
  return session.user.id;
}

async function GET({ request }: { request: Request }) {
  try {
    await getAdmin(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get('pageSize')) || 20)
    );
    const result = await listCodes({
      page,
      pageSize,
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
    });
    return respPage(result.items, result.total);
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

async function POST({ request }: { request: Request }) {
  try {
    const createdBy = await getAdmin(request);
    const body = await request.json().catch(() => ({}));
    const expiresAt = new Date(body?.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()))
      return respErr('Valid expiration is required');
    const rows = await createBatch({
      count: Number(body?.count),
      credits: Number(body?.credits),
      expiresAt,
      note: typeof body?.note === 'string' ? body.note : '',
      createdBy,
    });
    return respData(rows);
  } catch (error: any) {
    return respErr(error.message || 'Could not create codes');
  }
}

async function PATCH({ request }: { request: Request }) {
  try {
    await getAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return respErr('ID is required');
    await invalidateCode(id);
    return respOk();
  } catch (error: any) {
    return respErr(error.message || 'Could not invalidate code');
  }
}

export const Route = createFileRoute('/api/admin/credit-redeem-codes')({
  server: { handlers: { GET, POST, PATCH } },
});
