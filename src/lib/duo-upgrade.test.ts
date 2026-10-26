import { describe, expect, it } from 'vitest';

import { computeDuoUpgrade, standardVideoCount } from './duo-upgrade';

const now = 1_800_000_000_000;
const base = {
  duoPriceInCents: 1699,
  duoCredits: 50,
  originalCredits: 10,
  originalCurrency: 'usd',
  duoCurrency: 'usd',
  originalPaidAtMs: now - 60_000,
  nowMs: now,
};

describe('computeDuoUpgrade', () => {
  it('charges $12.00 after a $4.99 single and grants 40 remaining credits', () => {
    expect(computeDuoUpgrade({ ...base, originalAmountInCents: 499 })).toEqual({
      differenceInCents: 1200,
      remainingCredits: 40,
    });
  });
  it('charges $11.00 after a $5.99 single', () => {
    expect(
      computeDuoUpgrade({ ...base, originalAmountInCents: 599 })?.differenceInCents
    ).toBe(1100);
  });
  it('rejects non-USD, expired, unpaid and already-Duo-sized purchases', () => {
    expect(computeDuoUpgrade({ ...base, originalAmountInCents: 499, originalCurrency: 'eur' })).toBeNull();
    expect(computeDuoUpgrade({ ...base, originalAmountInCents: 499, originalPaidAtMs: now - 25 * 3600_000 })).toBeNull();
    expect(computeDuoUpgrade({ ...base, originalAmountInCents: 499, originalPaidAtMs: null })).toBeNull();
    expect(computeDuoUpgrade({ ...base, originalAmountInCents: 1699 })).toBeNull();
    expect(computeDuoUpgrade({ ...base, originalAmountInCents: 499, originalCredits: 50 })).toBeNull();
  });
  it('verifies the 5-video claim: 50 credits at 10 per Standard video', () => {
    expect(standardVideoCount(50)).toBe(5);
  });
});
