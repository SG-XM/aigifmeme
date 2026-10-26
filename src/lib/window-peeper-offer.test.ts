import { describe, expect, it } from 'vitest';

import { windowPeeperSingleOfferLd } from './window-peeper-offer';

describe('window peeper Single offer', () => {
  it('exposes USD 6.99 on the English and localized page URLs', () => {
    const description =
      'As of 2026-10-24, Bulin Single is $6.99 for 10 credits.';
    const offer = windowPeeperSingleOfferLd('en', description);
    expect(offer).toMatchObject({
      '@type': 'Product',
      name: 'Bulin Single',
      description,
      offers: {
        '@type': 'Offer',
        price: '6.99',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    });
    expect(offer.url).toMatch(/\/window-peeper$/);
    expect(offer.offers.url).toBe(offer.url);
    expect(offer.url).not.toContain('/zh/');

    const zh = windowPeeperSingleOfferLd('zh', description);
    expect(zh.url).toContain('/zh/window-peeper');
    expect(zh.offers.price).toBe('6.99');
    expect(zh.offers.priceCurrency).toBe('USD');

    const serialized = JSON.stringify(offer);
    expect(serialized).not.toContain('$9.99');
    expect(serialized).not.toContain('9.90');
    expect(serialized.toLowerCase()).not.toMatch(/chatgpt|\bbest\b/);
  });
});
