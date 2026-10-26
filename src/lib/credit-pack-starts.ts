import {
  asCatalogLocale,
  formatCatalogMoney,
  type PublicCreditPack,
} from '@/lib/public-credit-packs';
import { m } from '@/paraglide/messages.js';

export function creditPackStartsLine(pack: PublicCreditPack, locale: string) {
  return m['landing.pricing.pack_starts'](
    {
      name: pack.name,
      price: formatCatalogMoney(pack.priceInCents, pack.currency, locale),
      credits: pack.credits.toLocaleString(locale),
    },
    { locale: asCatalogLocale(locale) }
  );
}
