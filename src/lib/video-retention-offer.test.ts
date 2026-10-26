import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  nearestRetentionNamePriceCents,
  RETENTION_NAME_PRICE_EXPERIMENT_KEY,
  RETENTION_NAME_PRICE_PRODUCT_IDS,
  RETENTION_NAME_PRICE_SCENE,
  retentionCreateRedirect,
  retentionNamePriceCents,
} from './video-retention-offer';

describe('retention name-your-price chips', () => {
  it('snaps typed amounts onto $4.99, $5.99, $7.99, or $9.99', () => {
    expect(nearestRetentionNamePriceCents(499)).toBe(499);
    expect(nearestRetentionNamePriceCents(500)).toBe(499);
    expect(nearestRetentionNamePriceCents(599)).toBe(599);
    expect(nearestRetentionNamePriceCents(649)).toBe(599);
    expect(nearestRetentionNamePriceCents(699)).toBe(599);
    expect(nearestRetentionNamePriceCents(700)).toBe(799);
    expect(nearestRetentionNamePriceCents(1)).toBe(499);
    expect(nearestRetentionNamePriceCents(5000)).toBe(999);
    expect(nearestRetentionNamePriceCents(Number.NaN)).toBe(599);
  });

  it('accepts only the four catalog product ids', () => {
    expect(RETENTION_NAME_PRICE_PRODUCT_IDS).toEqual([
      'single_retention_name_499',
      'single_retention_name_599',
      'single_retention_name_799',
      'single_retention_name_999',
    ]);
    expect(retentionNamePriceCents('single_retention_name_599')).toBe(599);
    expect(retentionNamePriceCents('single_retention_v2')).toBeNull();
    expect(retentionNamePriceCents('single_retention_name_450')).toBeNull();
  });

  it('returns each campaign to its own create anchor', () => {
    expect(retentionCreateRedirect('bulin')).toBe('/#create');
    expect(retentionCreateRedirect('bridges')).toBe(
      '/burning-bridges-ai#create'
    );
    expect(retentionCreateRedirect('peeper')).toBe('/window-peeper#create');
  });

  it('ships a draft experiment and insert-only chip rows', () => {
    const sql = readFileSync('drizzle/0016_retention_name_price.sql', 'utf8');
    expect(sql).toContain(RETENTION_NAME_PRICE_EXPERIMENT_KEY);
    expect(sql).toContain(RETENTION_NAME_PRICE_SCENE);
    expect(sql).toContain("'draft'");
    expect(sql).not.toContain("'running'");
    expect(sql).toContain('single_retention_v2');
    for (const id of RETENTION_NAME_PRICE_PRODUCT_IDS)
      expect(sql).toContain(id);
    expect(sql).not.toMatch(/UPDATE\s+credit_top_up_product/i);
  });
});
