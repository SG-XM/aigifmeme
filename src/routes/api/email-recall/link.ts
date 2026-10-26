import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  getRecallByToken,
  getRecallProduct,
  hasRecallPayment,
  ownedRecall,
} from '@/modules/email-recall/service';
import { recallLocale } from '@/lib/email-recall';
import { regionalPrice } from '@/lib/regional-pricing';
import { respData, respErr } from '@/lib/resp';

export async function GET({ request }: { request: Request }) {
  try {
    const row = await getRecallByToken(
      new URL(request.url).searchParams.get('token')
    );
    const opts = {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    };
    if (!row) return respData({ status: 'invalid' }, opts);
    if (row.expiresAt.getTime() <= Date.now())
      return respData({ status: 'expired' }, opts);
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user)
      return respData(
        { status: 'sign-in', locale: recallLocale(row.locale) },
        opts
      );
    if (row.userId !== session.user.id)
      return respData({ status: 'invalid' }, opts);
    if (await hasRecallPayment(session.user.id, row.recipientEmail))
      return respData({ status: 'paid' }, opts);
    await ownedRecall(
      new URL(request.url).searchParams.get('token'),
      session.user.id
    );
    const product = await getRecallProduct(row.productId);
    if (!product) return respData({ status: 'unavailable' }, opts);
    const priced = regionalPrice(product, request);
    const locale = recallLocale(row.locale);
    return respData(
      {
        status: 'ready',
        locale,
        productName: locale === 'es' ? product.nameEs : product.name,
        amount: priced.amount,
        currency: priced.currency,
        subscription: product.subscription,
        interval: product.interval,
      },
      opts
    );
  } catch {
    return respErr('Recall link unavailable', { status: 400 });
  }
}
export const Route = createFileRoute('/api/email-recall/link')({
  server: { handlers: { GET } },
});
