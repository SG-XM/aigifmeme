import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { getFunnelStats } from '@/modules/funnel/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Unauthorized', { status: 401 });
    if (!(await hasPermission(session.user.id, 'admin.*')))
      return respErr('Forbidden', { status: 403 });

    const requestedDays = new URL(request.url).searchParams.get('days') || '30';
    const parsedDays = z
      .enum(['7', '30', '90', 'all'])
      .safeParse(requestedDays);
    const days = parsedDays.success ? parsedDays.data : '30';
    return respData(await getFunnelStats(days), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('admin funnel stats error:', error);
    return respErr('Internal error');
  }
}

export const Route = createFileRoute('/api/admin/funnel')({
  server: { handlers: { GET } },
});
