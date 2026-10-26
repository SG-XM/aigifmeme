import { createFileRoute } from '@tanstack/react-router';

import { redeemCode } from '@/modules/credit-redeem-codes/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'credit-code-redeem',
  });
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!code) return respErr('Enter a redemption code');
    if (email.length > 320 || !EMAIL_PATTERN.test(email))
      return respErr('Enter a valid email address');
    return respData(await redeemCode({ code, email }));
  } catch (error: any) {
    return respErr(error.message || 'Redemption failed');
  }
}

export const Route = createFileRoute('/api/credit-redeem-codes/redeem')({
  server: { handlers: { POST } },
});
