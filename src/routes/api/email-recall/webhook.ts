import { createFileRoute } from '@tanstack/react-router';

import { getAllConfigs } from '@/modules/config/service';
import { suppressRecall } from '@/modules/email-recall/service';
import { verifyRecallWebhook } from '@/lib/email-recall-token';
import { respErr, respOk } from '@/lib/resp';

export async function POST({ request }: { request: Request }) {
  const raw = await request.text();
  if (raw.length > 64_000) return respErr('Payload too large', { status: 413 });
  const configs = await getAllConfigs(true);
  if (
    !verifyRecallWebhook(
      raw,
      request.headers,
      configs.email_recall_webhook_secret || ''
    )
  )
    return respErr('Invalid signature', { status: 401 });
  const event = JSON.parse(raw) as { type?: string; data?: { to?: unknown[] } };
  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    for (const email of (event.data?.to || []).slice(0, 20))
      if (typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        await suppressRecall(email, event.type);
  }
  return respOk();
}
export const Route = createFileRoute('/api/email-recall/webhook')({
  server: { handlers: { POST } },
});
