import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleWebhook } from './service';

const mock = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  event: {} as Record<string, unknown>,
  fulfill: vi.fn(),
  funnel: vi.fn(),
}));
vi.mock('@/core/db', () => ({
  db: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [mock.order] }) }),
    }),
  }),
}));
vi.mock('@/core/db/payment-fulfillment', () => ({
  fulfillPayment: mock.fulfill,
}));
vi.mock('@/lib/funnel', () => ({ recordFunnelEvent: mock.funnel }));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: async () => ({}),
}));
vi.mock('@/modules/credits/service', () => ({
  calculateCreditExpirationTime: () => null,
}));
vi.mock('@/modules/subscriptions/service', () => ({
  findByProviderSubscriptionId: vi.fn(),
  findBySubscriptionNo: vi.fn(),
  updateBySubscriptionNo: vi.fn(),
  SubscriptionStatus: { ACTIVE: 'active' },
}));
vi.mock('@/core/payment', () => ({
  PaymentManager: class {
    getPaymentEvent = async () => mock.event;
  },
  AlipayProvider: class {},
  CreemProvider: class {},
  PayPalProvider: class {},
  StripeProvider: class {},
  WechatPayProvider: class {},
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.order = {
    id: 'o1',
    orderNo: 'R1',
    userId: 'u1',
    status: 'created',
    paymentConfirmedAt: null,
    currency: 'usd',
    creditsAmount: 10,
    creditsValidDays: 0,
    paymentType: 'one-time',
    userEmail: 'one@example.test',
    isTest: false,
    checkoutSource: 'email_recall',
  };
  mock.event = {
    eventType: 'checkout.success',
    paymentSession: {
      paymentResult: { id: 'session1' },
      paymentStatus: 'paid',
      paymentInfo: { paymentCurrency: 'usd', paymentAmount: 499 },
    },
  };
});
describe('payment callback attribution', () => {
  it('fulfills a recall purchase normally but emits only recall payment analytics', async () => {
    await handleWebhook({
      req: new Request('https://example.test'),
      provider: 'stripe',
    });
    expect(mock.fulfill).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ status: 'paid', paymentAmount: 499 }),
      [
        expect.objectContaining({
          values: expect.objectContaining({
            userId: 'u1',
            credits: 10,
            remainingCredits: 10,
          }),
        }),
      ]
    );
    expect(mock.funnel).toHaveBeenCalledExactlyOnceWith(
      'recall_payment_succeeded',
      'u1',
      'u1'
    );
  });
  it('continues recording site payments in the original funnel', async () => {
    mock.order.checkoutSource = 'site';
    await handleWebhook({
      req: new Request('https://example.test'),
      provider: 'stripe',
    });
    expect(mock.funnel).toHaveBeenCalledExactlyOnceWith(
      'payment_succeeded',
      'u1',
      'u1'
    );
  });
  it('does not re-fulfill or re-count an already confirmed order', async () => {
    mock.order.paymentConfirmedAt = new Date();
    await handleWebhook({
      req: new Request('https://example.test'),
      provider: 'stripe',
    });
    expect(mock.fulfill).not.toHaveBeenCalled();
    expect(mock.funnel).not.toHaveBeenCalled();
  });
});
