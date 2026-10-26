import { createServerFn } from '@tanstack/react-start';

import {
  asCatalogLocale,
  type PublicCreditPack,
} from '@/lib/public-credit-packs';

export const getPublicCreditPacksFn = createServerFn()
  .inputValidator((locale: unknown) => asCatalogLocale(locale))
  .handler(async ({ data }): Promise<PublicCreditPack[] | null> => {
    try {
      const [{ getRequest }, { loadPublicCreditPacks }] = await Promise.all([
        import('@tanstack/react-start/server'),
        import('@/lib/public-credit-packs-server'),
      ]);
      let request: Request;
      try {
        const current = getRequest();
        request =
          current && typeof current.headers?.get === 'function'
            ? current
            : new Request('http://localhost/pricing');
      } catch {
        request = new Request('http://localhost/pricing');
      }
      return await loadPublicCreditPacks(data, request);
    } catch {
      return null;
    }
  });
