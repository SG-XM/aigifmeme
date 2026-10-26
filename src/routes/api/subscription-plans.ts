import { createFileRoute } from '@tanstack/react-router';

import { requireCurrentCreditPricing } from '@/modules/credits/service';
import { listEnabledSubscriptionPlans } from '@/modules/subscription-plans/service';
import { regionalPrice } from '@/lib/regional-pricing';
import { respData, respErr } from '@/lib/resp';

const noStore = {
  headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
};

async function GET({ request }: { request: Request }) {
  try {
    await requireCurrentCreditPricing();
    const requestedLocale = new URL(request.url).searchParams.get('locale');
    const locale =
      requestedLocale === 'zh' ||
      requestedLocale === 'es' ||
      requestedLocale === 'ar'
        ? requestedLocale
        : 'en';
    const plans = await listEnabledSubscriptionPlans(locale);
    return respData(
      plans.map((plan: { currency: string }) => regionalPrice(plan, request)),
      noStore
    );
  } catch {
    return respErr('Unable to load subscription plans');
  }
}

export const Route = createFileRoute('/api/subscription-plans')({
  server: { handlers: { GET } },
});
