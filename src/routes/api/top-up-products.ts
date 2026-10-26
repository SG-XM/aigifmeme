import { createFileRoute } from '@tanstack/react-router';

import { asCatalogLocale } from '@/lib/public-credit-packs';
import { loadPublicCreditPacks } from '@/lib/public-credit-packs-server';
import { respData, respErr } from '@/lib/resp';

const noStore = {
  headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
};

async function GET({ request }: { request: Request }) {
  const locale = asCatalogLocale(
    new URL(request.url).searchParams.get('locale')
  );
  const products = await loadPublicCreditPacks(locale, request);
  if (!products) return respErr('Unable to load credit top-ups');
  return respData(products, noStore);
}

export const Route = createFileRoute('/api/top-up-products')({
  server: { handlers: { GET } },
});
