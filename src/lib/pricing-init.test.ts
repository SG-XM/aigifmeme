import { describe, expect, it } from 'vitest';

import {
  buildRetentionNamePriceRows,
  buildRetentionProductRow,
  planPricingInit,
} from './pricing-init';
import { CREDIT_PACKS, SUBSCRIPTION_PLANS } from './video-pricing';
import { RETENTION_NAME_PRICE_PRODUCT_IDS } from './video-retention-offer';

const ALL_IDS = [
  ...CREDIT_PACKS.map((p) => p.productId),
  'single_retention_v2',
  ...RETENTION_NAME_PRICE_PRODUCT_IDS,
  ...SUBSCRIPTION_PLANS.map((p) => p.productId),
];

describe('pricing init plan', () => {
  it('seeds the full catalog plus the retention product on a fresh DB', () => {
    const plan = planPricingInit([]);
    expect(plan.insertTopUps.map((r) => r.productId)).toEqual([
      ...CREDIT_PACKS.map((p) => p.productId),
      'single_retention_v2',
      ...RETENTION_NAME_PRICE_PRODUCT_IDS,
    ]);
    expect(plan.insertPlans.map((r) => r.productId)).toEqual(
      SUBSCRIPTION_PLANS.map((p) => p.productId)
    );
    expect(plan.existingProductIds).toEqual([]);
  });

  it('is a no-op when every product already exists (idempotent re-run)', () => {
    const plan = planPricingInit(ALL_IDS);
    expect(plan.insertTopUps).toEqual([]);
    expect(plan.insertPlans).toEqual([]);
    expect(plan.existingProductIds).toEqual(ALL_IDS);
  });

  it('only inserts the missing products on a partial catalog', () => {
    const plan = planPricingInit(['single_v2', 'basic_monthly_v2']);
    expect(plan.insertTopUps.map((r) => r.productId)).not.toContain(
      'single_v2'
    );
    expect(plan.insertPlans.map((r) => r.productId)).not.toContain(
      'basic_monthly_v2'
    );
    expect(plan.insertTopUps.map((r) => r.productId)).toContain('duo_v2');
  });

  it('retention row matches seed-video-retention-offer.sql', () => {
    const row = buildRetentionProductRow();
    expect(row).toMatchObject({
      productId: 'single_retention_v2',
      priceInCents: 799,
      credits: 10,
      creditsValidDays: 0,
      enabled: true,
      sort: 999,
    });
  });

  it('name-your-price rows are the four chip amounts and do not replace control', () => {
    expect(
      buildRetentionNamePriceRows().map((row) => row.priceInCents)
    ).toEqual([499, 599, 799, 999]);
    expect(buildRetentionProductRow().priceInCents).toBe(799);
    expect(
      buildRetentionNamePriceRows().every((row) => row.credits === 10)
    ).toBe(true);
  });
});
