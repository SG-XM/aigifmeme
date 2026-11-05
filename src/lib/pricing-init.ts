/**
 * Fresh-database pricing catalog for `pnpm db:init-pricing`.
 *
 * Row shapes mirror `scripts/update-video-pricing.ts` (the legacy→v2
 * cutover) and `scripts/seed-video-retention-offer.sql`, so a database
 * initialized here is indistinguishable from one cut over there. The init
 * command inserts only missing product IDs and never updates existing
 * rows, which makes it safe to re-run: admin catalog edits survive.
 */

import {
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  VIDEO_PRICING_VERSION,
} from './video-pricing';
import {
  RETENTION_NAME_PRICE_CENTS,
  retentionNamePriceProductId,
  VIDEO_RETENTION_PRODUCT_ID,
} from './video-retention-offer';

export { VIDEO_PRICING_VERSION };

export interface TopUpProductRow {
  productId: string;
  name: string;
  description: string;
  nameEs: string;
  descriptionEs: string;
  priceInCents: number;
  currency: string;
  credits: number;
  creditsValidDays: number;
  enabled: boolean;
  sort: number;
}

export interface SubscriptionPlanRow {
  productId: string;
  nameEn: string;
  nameZh: string;
  nameEs: string;
  descriptionEn: string;
  descriptionZh: string;
  descriptionEs: string;
  featuresEn: string;
  featuresZh: string;
  featuresEs: string;
  badgeEn: string;
  badgeZh: string;
  badgeEs: string;
  priceInCents: number;
  compareAtPriceInCents: null;
  currency: string;
  interval: string;
  intervalCount: number;
  credits: number;
  creditsValidDays: number;
  featured: boolean;
  enabled: boolean;
  sort: number;
}

export function buildTopUpProductRows(): TopUpProductRow[] {
  return CREDIT_PACKS.map((pack, index) => ({
    ...pack,
    description: '',
    nameEs: '',
    descriptionEs: '',
    currency: 'usd',
    creditsValidDays: 0,
    enabled: true,
    sort: (index + 1) * 10,
  }));
}

/** Retention offer row — verbatim from seed-video-retention-offer.sql. */
export function buildRetentionProductRow(): TopUpProductRow {
  return {
    productId: VIDEO_RETENTION_PRODUCT_ID,
    name: 'AIGifMeme credits',
    description:
      'One-time offer: 10 credits. Start checkout within 30 minutes. No subscription.',
    nameEs: 'Créditos de AIGifMeme',
    descriptionEs:
      'Oferta única: 10 créditos. Inicia el pago en 30 minutos. Sin suscripción.',
    priceInCents: 799,
    currency: 'usd',
    credits: 10,
    creditsValidDays: 0,
    enabled: true,
    sort: 999,
  };
}

/** Hidden name-your-price chips. Insert-only; never rewrites the control price. */
export function buildRetentionNamePriceRows(): TopUpProductRow[] {
  return RETENTION_NAME_PRICE_CENTS.map((cents, index) => ({
    productId: retentionNamePriceProductId(cents),
    name: `AIGifMeme credits · $${(cents / 100).toFixed(2)}`,
    description:
      'One-time offer: 10 credits. Choose this price in the 30-minute offer. No subscription.',
    nameEs: `Créditos de AIGifMeme · $${(cents / 100).toFixed(2)}`,
    descriptionEs:
      'Oferta única: 10 créditos. Elige este precio en la oferta de 30 minutos. Sin suscripción.',
    priceInCents: cents,
    currency: 'usd',
    credits: 10,
    creditsValidDays: 0,
    enabled: true,
    sort: 1000 + index,
  }));
}

export function buildSubscriptionPlanRows(): SubscriptionPlanRow[] {
  return SUBSCRIPTION_PLANS.map((plan, index) => {
    const yearly = plan.interval === 'year';
    return {
      ...plan,
      nameEn: plan.name,
      nameZh: plan.name,
      nameEs: '',
      descriptionEn: '',
      descriptionZh: '',
      descriptionEs: '',
      badgeEn: plan.name === 'Studio' ? 'Best value' : '',
      badgeZh: plan.name === 'Studio' ? '超值之选' : '',
      badgeEs: '',
      featuresEn: `HD video, no watermark\nDownload & post anywhere\n${yearly ? 'All year’s credits up front' : 'Credits refresh every month'}\nCancel anytime`,
      featuresZh: `高清视频，无水印\n下载与分享\n${yearly ? '全年积分一次发放' : '每月刷新积分'}\n随时取消续费`,
      featuresEs: '',
      compareAtPriceInCents: null,
      currency: 'usd',
      intervalCount: 1,
      creditsValidDays: yearly ? 365 : 31,
      featured: plan.featured,
      enabled: true,
      sort: ((index % 3) + 1) * 10,
    };
  });
}

export interface PricingInitPlan {
  /** Rows whose productId is not yet in the database. */
  insertTopUps: TopUpProductRow[];
  insertPlans: SubscriptionPlanRow[];
  /** Product IDs already present — left untouched (admin edits preserved). */
  existingProductIds: string[];
}

/** Pure diff used by the init script; unit-tested for idempotency. */
export function planPricingInit(
  existingProductIds: Iterable<string>
): PricingInitPlan {
  const existing = new Set(existingProductIds);
  const topUps = [
    ...buildTopUpProductRows(),
    buildRetentionProductRow(),
    ...buildRetentionNamePriceRows(),
  ];
  const plans = buildSubscriptionPlanRows();
  return {
    insertTopUps: topUps.filter((row) => !existing.has(row.productId)),
    insertPlans: plans.filter((row) => !existing.has(row.productId)),
    existingProductIds: [...topUps, ...plans]
      .map((row) => row.productId)
      .filter((id) => existing.has(id)),
  };
}
