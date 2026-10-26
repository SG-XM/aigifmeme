export const CATALOG_LOCALES = ['en', 'zh', 'es', 'ar'] as const;

export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

/** Public top-up row. Same fields the pricing page reads from `/api/top-up-products`. */
export type PublicCreditPack = {
  productId: string;
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
  credits: number;
  creditsValidDays: number;
  sort: number;
};

export function asCatalogLocale(locale: unknown): CatalogLocale {
  return locale === 'zh' || locale === 'es' || locale === 'ar' ? locale : 'en';
}

export function formatCatalogMoney(
  amountInCents: number,
  currency: string,
  locale: string
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amountInCents / 100);
}

/** Entry pack crawlers should quote. Falls back to the first enabled pack. */
export function leadCreditPack<T extends { productId: string }>(
  packs: readonly T[]
): T | null {
  return (
    packs.find((pack) => pack.productId === 'single_v2') ?? packs[0] ?? null
  );
}
