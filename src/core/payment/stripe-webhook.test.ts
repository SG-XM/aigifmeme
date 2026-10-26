import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { StripeProvider } from './stripe';
import { PaymentEventType, PaymentStatus } from './types';

// Use the actual Worker SDK: Node's crypto implementation hides this failure.
vi.mock('stripe', async () => {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const workerPath = createRequire(import.meta.url)
    .resolve('stripe')
    .replace(/cjs\/stripe\.cjs\.node\.js$/, 'esm/stripe.esm.worker.js');
  return import(/* @vite-ignore */ pathToFileURL(workerPath).href);
});

const secret = crypto.randomUUID();
const payload = JSON.stringify({
  id: 'evt_local',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_local',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 50,
      currency: 'usd',
      metadata: { order_no: 'ORD_local' },
    },
  },
});

async function signedRequest(body = payload) {
  const stripe = new Stripe('sk_test_local_webhook_test');
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
  });
  return new Request('https://example.test/api/payment/notify/stripe', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': signature },
  });
}

function provider() {
  return new StripeProvider({
    secretKey: 'sk_test_local_webhook_test',
    publishableKey: 'pk_test_local_webhook_test',
    signingSecret: secret,
  });
}

describe('Stripe webhook in the Worker runtime', () => {
  it('verifies a signed checkout event with async-only crypto', async () => {
    const event = await provider().getPaymentEvent({
      req: await signedRequest(),
    });
    expect(event.eventType).toBe(PaymentEventType.CHECKOUT_SUCCESS);
    expect(event.paymentSession).toMatchObject({
      paymentStatus: PaymentStatus.SUCCESS,
      paymentInfo: { paymentAmount: 50, paymentCurrency: 'usd' },
      metadata: { order_no: 'ORD_local' },
    });
  });

  it('accepts a payment_intent.succeeded event for an Apple Pay charge', async () => {
    const body = JSON.stringify({
      id: 'evt_pi',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_local',
          object: 'payment_intent',
          status: 'succeeded',
          amount: 799,
          amount_received: 799,
          currency: 'usd',
          metadata: { order_no: 'ORD_local' },
        },
      },
    });
    const stripe = new Stripe('sk_test_local_webhook_test');
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret,
    });
    const event = await provider().getPaymentEvent({
      req: new Request('https://example.test/api/payment/notify/stripe', {
        method: 'POST',
        body,
        headers: { 'stripe-signature': signature },
      }),
    });
    expect(event.eventType).toBe(PaymentEventType.CHECKOUT_SUCCESS);
    expect(event.paymentSession).toMatchObject({
      paymentStatus: PaymentStatus.SUCCESS,
      paymentInfo: { paymentAmount: 799, paymentCurrency: 'usd' },
      paymentResult: { id: 'pi_local' },
      metadata: { order_no: 'ORD_local' },
    });
  });

  it('rejects a body changed after signing', async () => {
    await expect(
      provider().getPaymentEvent({
        req: await signedRequest(payload.replace('50', '500')),
      })
    ).rejects.toThrow(/signature/i);
  });
});
