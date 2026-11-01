import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './checkout';

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finish: vi.fn(),
  recover: vi.fn(),
  checkout: vi.fn(),
  reserveRecall: vi.fn(),
  finishRecall: vi.fn(),
  funnel: vi.fn(),
  product: vi.fn(),
  participant: vi.fn(),
  namePrice: vi.fn(),
}));
vi.mock('@/core/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => ({
        user: { id: 'u1', name: 'One', email: 'one@example.test' },
      }),
    },
  }),
}));
vi.mock('@/config', () => ({
  envConfigs: { app_url: 'https://example.test' },
}));
vi.mock('@/modules/ab-tests/service', () => ({
  getCheckoutParticipant: mocks.participant,
  getVisitorCheckoutParticipant: mocks.participant,
  isExposedSceneVariant: mocks.namePrice,
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => ({
    app_url: 'https://example.test',
    default_payment_provider: 'stripe',
    stripe_enabled: 'true',
  }),
}));
vi.mock('@/modules/credits/service', () => ({
  requireCurrentCreditPricing: async () => {},
}));
vi.mock('@/modules/payment/service', () => ({
  createCheckout: mocks.checkout,
}));
vi.mock('@/modules/subscription-plans/service', () => ({
  getEnabledSubscriptionPlan: async () => null,
}));
vi.mock('@/modules/top-up-products/service', () => ({
  getEnabledTopUpProduct: mocks.product,
}));
vi.mock('@/modules/email-recall/service', () => ({
  reserveRecallCheckout: mocks.reserveRecall,
  finishRecallCheckout: mocks.finishRecall,
}));
vi.mock('@/lib/funnel', () => ({ recordFunnelEvent: mocks.funnel }));
vi.mock('@/modules/video-retention-offers/service', () => ({
  reserveRetentionCheckout: mocks.reserve,
  finishRetentionCheckout: mocks.finish,
  recoverRetentionCheckout: mocks.recover,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceMinIntervalRateLimit: () => null,
}));
vi.mock('@/paraglide/runtime.js', () => ({
  getLocale: () => 'en',
  localizeUrl: (url: string) => new URL(url),
}));
const req = (body = {}) => ({
  request: new Request('https://example.test/api/payment/checkout', {
    method: 'POST',
    headers: {
      Origin: 'https://example.test',
      'Content-Type': 'application/json',
      'CF-IPCountry': 'DE',
    },
    body: JSON.stringify({ product_id: 'single_retention_v2', ...body }),
  }),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.participant.mockResolvedValue(null);
  mocks.namePrice.mockResolvedValue(false);
  mocks.product.mockResolvedValue({
    productId: 'single_retention_v2',
    name: 'One video',
    description: 'Limited offer',
    priceInCents: 799,
    currency: 'usd',
    credits: 10,
    creditsValidDays: 0,
  });
  mocks.finishRecall.mockResolvedValue(undefined);
  mocks.reserveRecall.mockResolvedValue({
    row: {
      id: 'r1',
      productId: 'public_pack',
      locale: 'es',
      paymentProvider: 'stripe',
    },
    lock: 'lock1',
    requestId: 'recall_r1_0',
  });
  mocks.reserve.mockResolvedValue({
    locked: JSON.stringify({ token: 'token1' }),
    state: { redirect: '/#create' },
  });
  mocks.checkout.mockResolvedValue({
    checkoutInfo: { checkoutUrl: 'https://checkout.stripe.com/test' },
  });
  mocks.finish.mockResolvedValue(undefined);
  mocks.recover.mockResolvedValue(undefined);
});
describe('retention checkout guards', () => {
  it('cannot buy the reserved product directly without an active offer', async () => {
    mocks.reserve.mockRejectedValue(
      new Error('This offer has expired or has already been used.')
    );
    expect((await (await POST(req())).json()).code).toBe(-1);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('uses the database price and allowance, with fixed USD and a server redirect', async () => {
    expect(
      (
        await (
          await POST(
            req({ price: 1, credits: 999, redirect: 'https://attacker.test' })
          )
        ).json()
      ).code
    ).toBe(0);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        credits: 10,
        paymentOrder: expect.objectContaining({
          requestId: 'retention_token1',
          price: { amount: 799, currency: 'usd' },
        }),
      })
    );
    expect(
      mocks.checkout.mock.calls[0][0].paymentOrder.successUrl
    ).not.toContain('attacker');
    expect(mocks.finish).toHaveBeenCalledWith(
      'u1',
      JSON.stringify({ token: 'token1' }),
      'https://checkout.stripe.com/test'
    );
    const cancelUrl = mocks.checkout.mock.calls[0][0].paymentOrder
      .cancelUrl as string;
    expect(cancelUrl).toContain('checkout_cancel=1');
    expect(cancelUrl).toContain('checkout_product=single_retention_v2');
  });
  it('reuses an existing URL instead of creating a second order', async () => {
    mocks.reserve.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/previous',
    });
    expect((await (await POST(req())).json()).data.checkout_url).toBe(
      'https://checkout.stripe.com/previous'
    );
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('recovers a failed checkout only for its authenticated owner and reservation', async () => {
    mocks.checkout.mockRejectedValue(new Error('Provider unavailable'));
    expect((await (await POST(req())).json()).code).toBe(-1);
    expect(mocks.recover).toHaveBeenCalledWith(
      'u1',
      JSON.stringify({ token: 'token1' })
    );
  });
  it('charges a name-your-price chip only for an exposed variant B', async () => {
    const namePriceProduct =
      (priceInCents: number) => async (productId: string) => ({
        productId,
        name: 'Name your price',
        description: 'Limited offer',
        priceInCents,
        currency: 'usd',
        credits: 10,
        creditsValidDays: 0,
      });
    mocks.product.mockImplementation(namePriceProduct(599));
    expect(
      (
        await (
          await POST(
            req({
              product_id: 'single_retention_name_599',
              ab_participant_id: 'p1',
            })
          )
        ).json()
      ).code
    ).toBe(-1);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    mocks.namePrice.mockResolvedValue(true);
    mocks.product.mockImplementation(namePriceProduct(450));
    expect(
      (
        await (
          await POST(
            req({
              product_id: 'single_retention_name_599',
              ab_participant_id: 'p1',
            })
          )
        ).json()
      ).code
    ).toBe(-1);
    expect(mocks.checkout).not.toHaveBeenCalled();
    mocks.product.mockImplementation(namePriceProduct(599));
    expect(
      (
        await (
          await POST(
            req({
              product_id: 'single_retention_name_599',
              price: 1,
              credits: 999,
              ab_participant_id: 'p1',
            })
          )
        ).json()
      ).code
    ).toBe(0);
    expect(mocks.reserve).toHaveBeenCalledWith(
      'u1',
      'single_retention_name_599'
    );
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: 10,
        productName: 'FileMeta Wipe credits · $5.99',
        paymentOrder: expect.objectContaining({
          price: { amount: 599, currency: 'usd' },
          productName: 'FileMeta Wipe credits · $5.99',
        }),
      })
    );
  });
  it('rejects other providers before reserving the offer', async () => {
    expect(
      (await (await POST(req({ payment_provider: 'paypal' }))).json()).code
    ).toBe(-1);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('rejects a malformed Apple Pay payment method before checkout', async () => {
    expect(
      (await (await POST(req({ apple_pay_payment_method: 'tok_bad' }))).json())
        .code
    ).toBe(-1);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('forwards an Apple Pay payment method and keeps the catalog price', async () => {
    expect(
      (
        await (
          await POST(
            req({
              apple_pay_payment_method: 'pm_1234567890abcdef',
              payment_provider: 'paypal',
            })
          )
        ).json()
      ).code
    ).toBe(0);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'stripe',
        paymentOrder: expect.objectContaining({
          applePayPaymentMethodId: 'pm_1234567890abcdef',
          price: { amount: 799, currency: 'usd' },
        }),
      })
    );
  });
});

describe('email recall attribution', () => {
  beforeEach(() =>
    mocks.product.mockResolvedValue({
      productId: 'public_pack',
      name: 'Public pack',
      nameEs: 'Paquete',
      description: 'Credits',
      priceInCents: 499,
      currency: 'usd',
      credits: 10,
      creditsValidDays: 0,
    })
  );
  it('uses the signed recipient product, records recall only, and bypasses A/B attribution', async () => {
    const result = await POST(
      req({
        recall_token: 'signed',
        product_id: 'attacker-product',
        price: 1,
        credits: 999,
        ab_participant_id: 'ab1',
      })
    );
    expect((await result.json()).code).toBe(0);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutSource: 'email_recall',
        recallId: 'r1',
        abParticipantId: null,
        credits: 10,
        paymentOrder: expect.objectContaining({
          productId: 'public_pack',
          requestId: 'recall_r1_0',
          price: { amount: 499, currency: 'eur' },
          metadata: expect.objectContaining({
            checkout_source: 'email_recall',
          }),
        }),
      })
    );
    expect(mocks.funnel).toHaveBeenCalledWith(
      'recall_checkout_created',
      expect.any(String),
      'u1'
    );
    expect(mocks.participant).not.toHaveBeenCalled();
    expect(mocks.finishRecall).toHaveBeenCalledWith(
      'r1',
      'lock1',
      'https://checkout.stripe.com/test'
    );
  });
  it('does not trust a caller-supplied source to suppress site analytics', async () => {
    await POST(
      req({
        product_id: 'public_pack',
        checkout_source: 'email_recall',
        recall_id: 'forged',
      })
    );
    expect(mocks.reserveRecall).not.toHaveBeenCalled();
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutSource: 'site' })
    );
    expect(mocks.funnel).toHaveBeenCalledWith(
      'checkout_created',
      expect.any(String),
      'u1'
    );
  });
  it('rejects invalid recall tokens without creating a normal checkout', async () => {
    mocks.reserveRecall.mockRejectedValue(new Error('Invalid recall link'));
    expect(
      (await (await POST(req({ recall_token: 'forged' }))).json()).code
    ).toBe(-1);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.funnel).toHaveBeenCalledWith(
      'checkout_create_failed',
      expect.any(String),
      'u1',
      expect.objectContaining({
        source: 'server',
        errorCode: 'checkout_failed',
        errorMessage: 'Invalid recall link',
      })
    );
  });
  it('reuses a cached email checkout without another order or funnel event', async () => {
    mocks.reserveRecall.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/cached',
    });
    expect(
      (await (await POST(req({ recall_token: 'signed' }))).json()).data
        .checkout_url
    ).toContain('cached');
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.funnel).not.toHaveBeenCalled();
  });
});
