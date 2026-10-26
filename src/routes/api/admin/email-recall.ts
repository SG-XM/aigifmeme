import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { user } from '@/config/db/schema';
import { getAllConfigs } from '@/modules/config/service';
import { getRecallStats, issueRecall } from '@/modules/email-recall/service';
import { hasPermission } from '@/modules/rbac/service';
import { isABMutationAllowed } from '@/lib/ab-tests';
import { recallLocale } from '@/lib/email-recall';
import { runEmailRecall } from '@/lib/email-recall-runner';
import { recallToken } from '@/lib/email-recall-token';
import { respData, respErr } from '@/lib/resp';

async function allowed(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user && (await hasPermission(session.user.id, 'admin.*'));
}
async function GET({ request }: { request: Request }) {
  if (!(await allowed(request))) return respErr('Forbidden', { status: 403 });
  const configs = await getAllConfigs(true);
  return respData(
    {
      ...(await getRecallStats()),
      enabled: configs.email_recall_enabled === 'true',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request) || !(await allowed(request)))
    return respErr('Forbidden', { status: 403 });
  try {
    const body = await request.json();
    if (body.action === 'run') return respData(await runEmailRecall());
    if (body.action !== 'link' || typeof body.userId !== 'string')
      return respErr('Invalid action');
    const [target] = await db()
      .select()
      .from(user)
      .where(eq(user.id, body.userId))
      .limit(1);
    if (!target) return respErr('User not found');
    const row = await issueRecall({
      userId: target.id,
      email: target.email,
      locale: target.locale,
      kind: body.kind === 'checkout' ? 'checkout' : 'paywall',
      triggeredAt: new Date(),
    });
    if (!row) return respErr('No eligible product or recipient');
    const configs = await getAllConfigs(true);
    const link = new URL(
      (recallLocale(row.locale) === 'es' ? '/es' : '') + '/recall',
      configs.app_url || envConfigs.app_url
    );
    link.searchParams.set('token', recallToken(row.id, 'checkout'));
    return respData(
      { url: link.href },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return respErr('Unable to prepare recall');
  }
}
export const Route = createFileRoute('/api/admin/email-recall')({
  server: { handlers: { GET, POST } },
});
