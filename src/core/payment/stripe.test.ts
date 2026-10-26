import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StripeProvider } from './stripe';
import { PaymentInterval, PaymentType } from './types';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  paymentIntentsCreate: vi.fn(),
  paymentIntentsConfirm: vi.fn(),
  paymentIntentsUpdate: vi.fn(),
  subscriptionsCreate: vi.fn(),
  productsCreate: vi.fn(),
  pricesCreate: vi.fn(),
  customersList: vi.fn(),
  customersCreate: vi.fn(),
}));
vi.mock('stripe', () => {
  class StripeMock {
    static createFetchHttpClient() {
      return {};
    }
    checkout = { sessions: { create: mocks.create } };
    paymentIntents = {
      create: mocks.paymentIntentsCreate,
      confirm: mocks.paymentIntentsConfirm,
      update: mocks.paymentIntentsUpdate,
    };
    subscriptions = { create: mocks.subscriptionsCreate };
    products = { create: mocks.productsCreate };
    prices = { create: mocks.pricesCreate };
    customers = {
      list: mocks.customersList,
      create: mocks.customersCreate,
    };
  }
  return { default: StripeMock };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({
    id: 'session-test',
    url: 'https://checkout.stripe.test/session',
  });
  mocks.customersList.mockResolvedValue({ data: [] });
  mocks.customersCreate.mockResolvedValue({ id: 'cus_test' });
  mocks.paymentIntentsCreate.mockResolvedValue({ id: 'pi_test' });
  mocks.paymentIntentsUpdate.mockResolvedValue({ id: 'pi_sub' });
  mocks.productsCreate.mockResolvedValue({ id: 'prod_test' });
  mocks.pricesCreate.mockResolvedValue({ id: 'price_test' });
  mocks.subscriptionsCreate.mockResolvedValue({
    id: 'sub_test',
    latest_invoice: {
      payments: {
        data: [
          {
            payment: { type: 'payment_intent', payment_intent: 'pi_sub' },
          },
        ],
      },
    },
  });
});

describe('Stripe regional checkout', () => {
  it.each([PaymentType.ONE_TIME, PaymentType.SUBSCRIPTION])(
    'sends fixed EUR prices to Stripe for %s',
    async (type) => {
      const provider = new StripeProvider({
        secretKey: 'test-placeholder',
        publishableKey: 'test-placeholder',
      });
      await provider.createPayment({
        order: {
          productName: 'Basic',
          price: { amount: 2990, currency: 'eur' },
          type,
          plan: {
            name: 'Basic',
            interval: PaymentInterval.MONTH,
            intervalCount: 1,
          },
        },
      });
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adaptive_pricing: { enabled: false },
          mode: type === PaymentType.SUBSCRIPTION ? 'subscription' : 'payment',
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'eur',
                unit_amount: 2990,
              }),
            }),
          ],
        })
      );
    }
  );
  it('preserves existing USD checkout settings', async () => {
    const provider = new StripeProvider({
      secretKey: 'test-placeholder',
      publishableKey: 'test-placeholder',
    });
    await provider.createPayment({
      order: {
        productName: 'Single',
        price: { amount: 999, currency: 'usd' },
        type: PaymentType.ONE_TIME,
      },
    });
    expect(mocks.create.mock.calls[0][0].adaptive_pricing).toBeUndefined();
    expect(mocks.create.mock.calls[0][0].payment_method_types).toBeUndefined();
    expect(
      mocks.create.mock.calls[0][0].line_items[0].price_data
    ).toMatchObject({ currency: 'usd', unit_amount: 999 });
  });
});

describe('Apple Pay intents', () => {
  const provider = () =>
    new StripeProvider({
      secretKey: 'test-placeholder',
      publishableKey: 'test-placeholder',
    });

  it('charges the catalog amount without payment_method_types', async () => {
    await provider().createApplePayIntent({
      order: {
        productName: 'Single',
        price: { amount: 799, currency: 'usd' },
        type: PaymentType.ONE_TIME,
        customer: { email: 'buyer@example.test', name: 'Buyer' },
        metadata: { order_no: 'ORD1' },
      },
      paymentMethodId: 'pm_1234567890abcd',
    });
    const params = mocks.paymentIntentsCreate.mock.calls[0][0];
    expect(params.payment_method_types).toBeUndefined();
    expect(params.automatic_payment_methods).toEqual({
      enabled: true,
      allow_redirects: 'never',
    });
    expect(params).toMatchObject({
      amount: 799,
      currency: 'usd',
      confirm: false,
      payment_method: 'pm_1234567890abcd',
      customer: 'cus_test',
    });
  });

  it('starts a subscription invoice without payment_method_types', async () => {
    await provider().createApplePayIntent({
      order: {
        productName: 'Basic',
        price: { amount: 2990, currency: 'usd' },
        type: PaymentType.SUBSCRIPTION,
        customer: { email: 'buyer@example.test' },
        plan: {
          name: 'Basic',
          interval: PaymentInterval.MONTH,
          intervalCount: 1,
        },
        metadata: { order_no: 'ORD2' },
      },
      paymentMethodId: 'pm_1234567890abcd',
    });
    expect(mocks.pricesCreate.mock.calls[0][0]).toMatchObject({
      currency: 'usd',
      unit_amount: 2990,
      product: 'prod_test',
      recurring: { interval: 'month', interval_count: 1 },
    });
    expect(
      mocks.pricesCreate.mock.calls[0][0].payment_method_types
    ).toBeUndefined();
    const params = mocks.subscriptionsCreate.mock.calls[0][0];
    expect(params.payment_method_types).toBeUndefined();
    expect(params.payment_settings.payment_method_types).toBeUndefined();
    expect(params.payment_behavior).toBe('default_incomplete');
    expect(params.items[0].price).toBe('price_test');
    expect(mocks.paymentIntentsUpdate).toHaveBeenCalledWith(
      'pi_sub',
      expect.objectContaining({
        metadata: expect.objectContaining({
          order_no: 'ORD2',
          subscription_id: 'sub_test',
        }),
      })
    );
  });

  it('confirms the wallet payment method without payment_method_types', async () => {
    mocks.paymentIntentsConfirm.mockResolvedValue({
      id: 'pi_test',
      status: 'succeeded',
    });
    await provider().confirmApplePayIntent('pi_test', 'pm_1234567890abcd');
    expect(mocks.paymentIntentsConfirm).toHaveBeenCalledWith('pi_test', {
      payment_method: 'pm_1234567890abcd',
    });
  });
});
