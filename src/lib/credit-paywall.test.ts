import { describe, expect, it } from 'vitest';

import {
  compactLeadProductId,
  compactPackProductIds,
  CREDIT_PAYWALL_SCENE,
  subscriptionLeadsCollapsed,
} from './credit-paywall';
import { creditPriceSavings } from './video-pricing';

describe('credit paywall offer order', () => {
  it('keeps the single pack in front for the control arm', () => {
    expect(compactPackProductIds('single-first')).toEqual([
      'single_v2',
      'duo_v2',
      'crew_v2',
    ]);
    expect(compactLeadProductId('single-first', 'basic_monthly_v2')).toBe(
      'single_v2'
    );
    expect(subscriptionLeadsCollapsed('single-first')).toBe(false);
  });

  it('leads with Basic monthly and leaves packs in single-first order', () => {
    expect(subscriptionLeadsCollapsed('basic-sub-first')).toBe(true);
    expect(compactLeadProductId('basic-sub-first', 'basic_monthly_v2')).toBe(
      'basic_monthly_v2'
    );
    expect(compactPackProductIds('basic-sub-first')).toEqual([
      'single_v2',
      'duo_v2',
      'crew_v2',
    ]);
  });

  it('falls back to the single pack when Basic monthly is absent', () => {
    expect(compactLeadProductId('basic-sub-first')).toBe('single_v2');
  });

  it('keeps the previous duo-first pack order available', () => {
    expect(compactPackProductIds('duo-first')[0]).toBe('duo_v2');
    expect(compactLeadProductId('duo-first')).toBe('duo_v2');
  });

  it('badges Basic monthly against the live $7.99 single, not a made-up price', () => {
    expect(CREDIT_PAYWALL_SCENE).toBe('paywall-sub-first-v1');
    expect(
      creditPriceSavings(
        { priceInCents: 2990, credits: 100 },
        { priceInCents: 799, credits: 10 }
      )
    ).toBe(63);
  });
});
