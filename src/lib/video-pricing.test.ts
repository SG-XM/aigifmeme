import { describe, expect, it } from 'vitest';

import {
  convertLegacyCredits,
  CREDIT_PACKS,
  creditPriceSavings,
  SUBSCRIPTION_PLANS,
} from './video-pricing';

describe('approved catalog economics', () => {
  it('matches all five pack prices and allowances', () => {
    expect(CREDIT_PACKS.map((p) => [p.priceInCents, p.credits])).toEqual([
      [999, 10],
      [2900, 50],
      [9900, 350],
      [19900, 900],
      [49900, 3000],
    ]);
    expect(
      CREDIT_PACKS.slice(1).map((p) => creditPriceSavings(p, CREDIT_PACKS[0]))
    ).toEqual([42, 72, 78, 83]);
  });
  it('matches monthly and upfront annual allowances', () => {
    expect(
      SUBSCRIPTION_PLANS.map((p) => [p.interval, p.priceInCents, p.credits])
    ).toEqual([
      ['month', 2990, 100],
      ['month', 4990, 300],
      ['month', 9990, 800],
      ['year', 10000, 400],
      ['year', 50000, 4000],
      ['year', 60000, 6000],
    ]);
    expect(
      SUBSCRIPTION_PLANS.map((p) =>
        creditPriceSavings(p, SUBSCRIPTION_PLANS[0])
      )
    ).toEqual([0, 44, 58, 16, 58, 67]);
  });
  it('requires safe positive conversion ratios and retains small balances', () => {
    expect(convertLegacyCredits(2400, 37, 2400)).toBe(37);
    expect(convertLegacyCredits(1, 37, 2400)).toBe(1);
    expect(convertLegacyCredits(-2400, 37, 2400)).toBe(-37);
    expect(() => convertLegacyCredits(5, 1, 0)).toThrow();
    expect(() => convertLegacyCredits(1.5, 1, 10)).toThrow();
  });
});
