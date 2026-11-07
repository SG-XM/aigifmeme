import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatCatalogMoney, leadCreditPack } from './public-credit-packs';
import { loadPublicCreditPacks } from './public-credit-packs-server';

const mocks = vi.hoisted(() => ({
  requireCurrentCreditPricing: vi.fn(),
  listEnabledTopUpProducts: vi.fn(),
}));

vi.mock('@/modules/credits/service', () => ({
  requireCurrentCreditPricing: mocks.requireCurrentCreditPricing,
}));
vi.mock('@/modules/top-up-products/service', () => ({
  listEnabledTopUpProducts: mocks.listEnabledTopUpProducts,
}));

const livePacks = [
  {
    productId: 'single_v2',
    name: 'Single',
    description: '',
    priceInCents: 699,
    currency: 'usd',
    credits: 10,
    creditsValidDays: 0,
    sort: 10,
  },
  {
    productId: 'duo_v2',
    name: 'Duo',
    description: '',
    priceInCents: 1699,
    currency: 'usd',
    credits: 50,
    creditsValidDays: 0,
    sort: 20,
  },
  {
    productId: 'crew_v2',
    name: 'Crew',
    description: '',
    priceInCents: 9900,
    currency: 'usd',
    credits: 350,
    creditsValidDays: 0,
    sort: 30,
  },
  {
    productId: 'studio_pack_v2',
    name: 'Studio',
    description: '',
    priceInCents: 19900,
    currency: 'usd',
    credits: 900,
    creditsValidDays: 0,
    sort: 40,
  },
  {
    productId: 'label_v2',
    name: 'Label',
    description: '',
    priceInCents: 49900,
    currency: 'usd',
    credits: 3000,
    creditsValidDays: 0,
    sort: 50,
  },
];

function request(country?: string) {
  return new Request('https://app.test/pricing', {
    headers: country ? { 'CF-IPCountry': country } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentCreditPricing.mockResolvedValue(undefined);
  mocks.listEnabledTopUpProducts.mockResolvedValue(livePacks);
});

describe('loadPublicCreditPacks', () => {
  it('returns the database catalog, including a $6.99 Single, for a US request', async () => {
    const packs = await loadPublicCreditPacks('en', request('US'));
    expect(
      packs?.map((pack) => [
        pack.name,
        pack.priceInCents,
        pack.currency,
        pack.credits,
      ])
    ).toEqual([
      ['Single', 699, 'usd', 10],
      ['Duo', 1699, 'usd', 50],
      ['Crew', 9900, 'usd', 350],
      ['Studio', 19900, 'usd', 900],
      ['Label', 49900, 'usd', 3000],
    ]);
    expect(packs?.map((pack) => pack.priceInCents)).not.toContain(999);
    expect(packs?.[0]?.sort).toBe(10);
    expect(
      formatCatalogMoney(packs![0].priceInCents, packs![0].currency, 'en')
    ).toBe('$6.99');
    expect(leadCreditPack(packs!)?.productId).toBe('single_v2');
  });

  it('uses EUR for a euro-area request without changing the cent amount', async () => {
    const packs = await loadPublicCreditPacks('es', request('DE'));
    expect(mocks.listEnabledTopUpProducts).toHaveBeenCalledWith('es');
    expect(packs?.[0]).toMatchObject({
      priceInCents: 699,
      currency: 'eur',
    });
  });

  it('loads enabled packs even when the checkout pricing gate would refuse', async () => {
    mocks.requireCurrentCreditPricing.mockRejectedValue(new Error('migration'));
    const packs = await loadPublicCreditPacks('en', request());
    expect(packs?.map((pack) => pack.productId)).toContain('single_v2');
    expect(mocks.requireCurrentCreditPricing).not.toHaveBeenCalled();
    expect(mocks.listEnabledTopUpProducts).toHaveBeenCalledWith('en');
  });
});
