import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StripeProvider } from './stripe';
import { PaymentType } from './types';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('stripe', () => ({
  default: class {
    static createFetchHttpClient() {
      return {};
    }
    checkout = { sessions: { create: mocks.create } };
  },
}));
beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({
    id: 'cs_test',
    url: 'https://checkout.stripe.com/test',
  });
});
describe('Stripe retention checkout', () => {
  it('uses a stable idempotency key and the literal USD catalog price', async () => {
    const provider = new StripeProvider({
      secretKey: 'test-placeholder',
      publishableKey: 'test-public-placeholder',
    });
    await provider.createPayment({
      order: {
        type: PaymentType.ONE_TIME,
        requestId: 'retention_test',
        productName: 'One video',
        price: { amount: 799, currency: 'usd' },
      },
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        adaptive_pricing: { enabled: false },
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              unit_amount: 799,
              currency: 'usd',
            }),
          }),
        ],
      }),
      { idempotencyKey: 'retention_test' }
    );
  });
  it('preserves regular USD checkout behavior', async () => {
    const provider = new StripeProvider({
      secretKey: 'test-placeholder',
      publishableKey: 'test-public-placeholder',
    });
    await provider.createPayment({
      order: {
        type: PaymentType.ONE_TIME,
        productName: 'Single',
        price: { amount: 990, currency: 'usd' },
      },
    });
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty(
      'adaptive_pricing'
    );
    expect(mocks.create.mock.calls[0][1]).toBeUndefined();
  });
});
