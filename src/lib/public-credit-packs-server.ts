import type {
  CatalogLocale,
  PublicCreditPack,
} from '@/lib/public-credit-packs';

/**
 * Enabled one-time packs from the same catalog `/api/top-up-products` serves.
 * Returns null when the pricing gate or the database read fails, so the page
 * can still render and the client query can try again.
 */
export async function loadPublicCreditPacks(
  locale: CatalogLocale,
  request: Request
): Promise<PublicCreditPack[] | null> {
  try {
    const { requireCurrentCreditPricing } =
      await import('@/modules/credits/service');
    const { listEnabledTopUpProducts } =
      await import('@/modules/top-up-products/service');
    const { regionalPrice } = await import('@/lib/regional-pricing');
    await requireCurrentCreditPricing();
    const products = await listEnabledTopUpProducts(locale);
    return products.map((product: PublicCreditPack) => {
      const priced = regionalPrice(product, request);
      return {
        productId: priced.productId,
        name: priced.name,
        description: priced.description,
        priceInCents: priced.priceInCents,
        currency: priced.currency,
        credits: priced.credits,
        creditsValidDays: priced.creditsValidDays,
        sort: priced.sort,
      };
    });
  } catch {
    return null;
  }
}
