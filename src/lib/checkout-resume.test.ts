import { describe, expect, it } from 'vitest';

import {
  checkoutReturnPath,
  claimCheckoutResume,
  readCheckoutResume,
  signInHref,
  stripCheckoutParams,
} from './checkout-resume';
import { funnelStepsFromCounts, sanitizeFunnelMetadata } from './funnel-events';

describe('checkout resume', () => {
  it('keeps the chosen plan on the same page and survives sign-in decoding', () => {
    const path = checkoutReturnPath(
      '/pricing',
      '?offer=1',
      '#plans',
      'single_v2',
      'pricing'
    );
    expect(path).toBe(
      '/pricing?offer=1&checkout=single_v2&checkout_from=pricing#plans'
    );
    const href = signInHref(path);
    expect(new URLSearchParams(href.split('?')[1]).get('redirect')).toBe(path);
    expect(readCheckoutResume(path.split('#')[0].split('?')[1])).toEqual({
      productId: 'single_v2',
      placement: 'pricing',
    });
  });

  it('refuses a cancel return and an invalid product id', () => {
    expect(
      readCheckoutResume('checkout=single_v2&checkout_cancel=1')
    ).toBeNull();
    expect(checkoutReturnPath('/', '', '', '../admin', 'home')).toBe('/');
    expect(
      readCheckoutResume('checkout=../admin&checkout_from=home')
    ).toBeNull();
  });

  it('strips resume and cancel markers without dropping other params', () => {
    expect(
      stripCheckoutParams(
        '?offer=1&checkout=single_v2&checkout_from=home&checkout_cancel=1&checkout_product=single_v2'
      )
    ).toBe('?offer=1');
  });

  it('claims an automatic resume once per product', () => {
    const storage = new Map<string, string>();
    const memory = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    expect(claimCheckoutResume('single_v2', memory)).toBe(true);
    expect(claimCheckoutResume('single_v2', memory)).toBe(false);
    expect(claimCheckoutResume('duo_v2', memory)).toBe(true);
  });
});

describe('funnel metadata', () => {
  it('keeps checkout fields and truncates the error', () => {
    expect(
      sanitizeFunnelMetadata({
        productId: 'duo_v2',
        priceInCents: 2900,
        currency: 'USD',
        placement: 'credit-insufficient',
        provider: 'stripe',
        source: 'server',
        errorCode: 'checkout_failed',
        errorMessage: `  ${'x'.repeat(200)}\nsecret  `,
      })
    ).toEqual({
      productId: 'duo_v2',
      priceInCents: 2900,
      currency: 'usd',
      placement: 'credit-insufficient',
      provider: 'stripe',
      source: 'server',
      errorCode: 'checkout_failed',
      errorMessage: 'x'.repeat(180),
    });
  });

  it('drops prices, urls, and placement strings that are not analytic fields', () => {
    expect(
      sanitizeFunnelMetadata({
        productId: 'https://evil.test',
        priceInCents: 1.5,
        currency: 'dollars',
        placement: 'Home Pricing',
        errorMessage: '   ',
      })
    ).toBeNull();
  });

  it('leaves the original conversion chain intact and appends checkout steps', () => {
    const steps = funnelStepsFromCounts({
      photo_selected: 10,
      authenticated: 5,
      paywall_shown: 4,
      checkout_created: 2,
      payment_succeeded: 1,
      checkout_click: 3,
    });
    expect(steps.map((step) => step.eventName)).toEqual([
      'photo_selected',
      'authenticated',
      'paywall_shown',
      'checkout_created',
      'payment_succeeded',
      'checkout_click',
      'checkout_signin_redirect',
      'checkout_create_failed',
      'checkout_redirected',
      'checkout_cancel_return',
    ]);
    expect(steps[4]).toMatchObject({
      visitors: 1,
      conversionFromPrevious: 0.5,
      dropOff: 1,
    });
    expect(steps[5]).toMatchObject({
      visitors: 3,
      conversionFromPrevious: null,
      dropOff: null,
    });
  });
});
