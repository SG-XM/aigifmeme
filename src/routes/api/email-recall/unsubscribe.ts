import { createFileRoute } from '@tanstack/react-router';

import {
  getRecallByToken,
  suppressRecall,
} from '@/modules/email-recall/service';
import { respData, respErr } from '@/lib/resp';

export async function POST({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const body = url.searchParams.has('token')
      ? null
      : await request.json().catch(() => null);
    const row = await getRecallByToken(
      url.searchParams.get('token') || body?.token,
      'unsubscribe'
    );
    if (!row) return respErr('Invalid unsubscribe link', { status: 400 });
    await suppressRecall(row.recipientEmail, 'unsubscribed');
    return respData(
      { unsubscribed: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return respErr('Unable to unsubscribe', { status: 400 });
  }
}
export const Route = createFileRoute('/api/email-recall/unsubscribe')({
  server: { handlers: { POST } },
});
