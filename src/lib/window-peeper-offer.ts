import { envConfigs } from '@/config';
import { WINDOW_PEEPER_PATH } from '@/lib/ai-video-paths';
import { localizeUrl, type Locale } from '@/paraglide/runtime.js';

/** Public Single checked on 2026-10-24. Not a live catalog read. */
export const WINDOW_PEEPER_SINGLE_PRICE = '6.99';
export const WINDOW_PEEPER_SINGLE_CURRENCY = 'USD';

/** Product + Offer so the dated Single price is a field, not only a sentence. */
export function windowPeeperSingleOfferLd(locale: Locale, description: string) {
  const baseUrl = envConfigs.app_url.replace(/\/$/, '');
  const url = localizeUrl(`${baseUrl}${WINDOW_PEEPER_PATH}`, { locale }).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Bulin Single',
    description,
    url,
    offers: {
      '@type': 'Offer',
      price: WINDOW_PEEPER_SINGLE_PRICE,
      priceCurrency: WINDOW_PEEPER_SINGLE_CURRENCY,
      url,
      availability: 'https://schema.org/InStock',
    },
  };
}
