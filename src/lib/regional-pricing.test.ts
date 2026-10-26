import { Route as checkoutRoute } from '@/routes/api/payment/checkout';
import { Route as plansRoute } from '@/routes/api/subscription-plans';
import { Route as packsRoute } from '@/routes/api/top-up-products';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isEuroAreaRequest, regionalPrice } from './regional-pricing';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  plans: vi.fn(),
  packs: vi.fn(),
  plan: vi.fn(),
  pack: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/modules/credits/service', () => ({
  requireCurrentCreditPricing: vi.fn(),
}));
vi.mock('@/modules/subscription-plans/service', () => ({
  listEnabledSubscriptionPlans: mocks.plans,
  getEnabledSubscriptionPlan: mocks.plan,
}));
vi.mock('@/modules/top-up-products/service', () => ({
  listEnabledTopUpProducts: mocks.packs,
  getEnabledTopUpProduct: mocks.pack,
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => ({
    default_payment_provider: 'stripe',
    app_url: 'https://app.test',
  }),
}));
vi.mock('@/modules/payment/service', () => ({
  createCheckout: mocks.checkout,
}));
vi.mock('@/modules/ab-tests/service', () => ({
  getCheckoutParticipant: vi.fn(),
}));
vi.mock('@/lib/ab-tests', () => ({
  isABMutationAllowed: () => true,
  AB_VISITOR_COOKIE: 'ab_home_visitor',
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));
vi.mock('@/paraglide/runtime.js', () => ({
  getLocale: () => 'en',
  localizeUrl: (url: string) => new URL(url),
}));

type Handlers = {
  server: {
    handlers: Record<
      string,
      (input: { request: Request }) => Promise<Response>
    >;
  };
};
const handlers = (route: unknown) => (route as Handlers).server.handlers;
const request = (country?: string, body?: unknown) =>
  new Request('https://app.test/api/test?locale=es', {
    method: body ? 'POST' : 'GET',
    headers: country ? { 'CF-IPCountry': country } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const catalogProduct = {
  productId: 'basic_monthly_v2',
  name: 'Basic',
  nameEn: 'Basic',
  nameZh: '基础',
  nameEs: 'Basic',
  description: '',
  descriptionEn: '',
  descriptionZh: '',
  descriptionEs: '',
  priceInCents: 2990,
  currency: 'usd',
  credits: 100,
  creditsValidDays: 30,
  interval: 'month',
  intervalCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'user', email: 'user@example.test', name: 'User' },
  });
  mocks.plans.mockResolvedValue([catalogProduct]);
  mocks.packs.mockResolvedValue([catalogProduct]);
  mocks.plan.mockResolvedValue(catalogProduct);
  mocks.pack.mockResolvedValue(catalogProduct);
  mocks.checkout.mockResolvedValue({
    checkoutInfo: { checkoutUrl: 'https://checkout.stripe.test/session' },
  });
});

describe('regional pricing', () => {
  it.each([
    'AT',
    'BE',
    'BG',
    'CY',
    'DE',
    'EE',
    'ES',
    'FI',
    'FR',
    'GR',
    'HR',
    'IE',
    'IT',
    'LT',
    'LU',
    'LV',
    'MT',
    'NL',
    'PT',
    'SI',
    'SK',
  ])('uses EUR in %s', (country) => {
    expect(regionalPrice(catalogProduct, request(country))).toEqual({
      ...catalogProduct,
      currency: 'eur',
    });
  });
  it.each([
    'US',
    'GB',
    'CH',
    'PL',
    'CZ',
    'DK',
    'HU',
    'RO',
    'SE',
    'MX',
    'XX',
    'T1',
    undefined,
  ])('keeps the catalog currency in %s regardless of UI locale', (country) => {
    expect(regionalPrice(catalogProduct, request(country))).toBe(
      catalogProduct
    );
  });
  it('prefers Worker country metadata and preserves other catalog currencies', () => {
    const req = request('DE');
    Object.defineProperty(req, 'cf', { value: { country: 'US' } });
    expect(isEuroAreaRequest(req)).toBe(false);
    expect(isEuroAreaRequest(request(' es '))).toBe(true);
    expect(regionalPrice({ currency: 'cny' }, request('ES')).currency).toBe(
      'cny'
    );
  });
  it.each([plansRoute, packsRoute])(
    'returns regional prices without shared response caching',
    async (route) => {
      for (const [country, currency] of [
        ['ES', 'eur'],
        ['US', 'usd'],
      ]) {
        const response = await handlers(route).GET({
          request: request(country),
        });
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect((await response.json()).data[0]).toMatchObject({
          priceInCents: 2990,
          currency,
        });
      }
    }
  );
  it.each(['subscription', 'topup'])(
    'charges the displayed EUR %s price and ignores client amounts/currency',
    async (kind) => {
      if (kind === 'topup') mocks.plan.mockResolvedValue(null);
      await handlers(checkoutRoute).POST({
        request: request('ES', {
          product_id: catalogProduct.productId,
          payment_provider: 'stripe',
          priceInCents: 1,
          currency: 'usd',
        }),
      });
      expect(mocks.checkout).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'stripe',
          credits: 100,
          paymentOrder: expect.objectContaining({
            price: { amount: 2990, currency: 'eur' },
          }),
        })
      );
    }
  );
  it('keeps USD checkout outside the euro area and still requires authentication', async () => {
    await handlers(checkoutRoute).POST({
      request: request('US', {
        product_id: catalogProduct.productId,
        currency: 'eur',
      }),
    });
    expect(mocks.checkout.mock.calls[0][0].paymentOrder.price).toEqual({
      amount: 2990,
      currency: 'usd',
    });
    mocks.checkout.mockClear();
    mocks.session.mockResolvedValue(null);
    const response = await handlers(checkoutRoute).POST({
      request: request('ES', { product_id: catalogProduct.productId }),
    });
    expect((await response.json()).code).toBe(-1);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
