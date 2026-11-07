import type {
  CatalogLocale,
  PublicCreditPack,
} from '@/lib/public-credit-packs';

/**
 * Enabled one-time packs from the same catalog `/api/top-up-products` serves.
 * Returns null only when the database read fails, so the page can still
 * render and the client query can try again.
 *
 * The checkout pricing-version gate is intentionally not applied here. That
 * gate blocks generation and payment when `video_credit_pricing_version` is
 * not the current marker. A public catalog read must still return the enabled
 * rows that are already stored.
 */
export async function loadPublicCreditPacks(
  locale: CatalogLocale,
  request: Request
): Promise<PublicCreditPack[] | null> {
  try {
    const { listEnabledTopUpProducts } =
      await import('@/modules/top-up-products/service');
    const { regionalPrice } = await import('@/lib/regional-pricing');
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
