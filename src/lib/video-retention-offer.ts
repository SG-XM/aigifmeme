import { effectHash, type EffectCampaign } from '@/lib/ai-video-paths';

export const VIDEO_RETENTION_PRODUCT_ID = 'single_retention_v2';
export const VIDEO_RETENTION_CONFIG_PREFIX = 'video_retention_offer:';
export const VIDEO_RETENTION_DURATION_MS = 30 * 60 * 1000;
export const VIDEO_RETENTION_EVENT = 'video-retention-offer-request';

/** Logged-in purchase-UI experiment. Variant A is today's fixed-price offer. */
export const RETENTION_NAME_PRICE_SCENE = 'video-retention-offer-v2';
export const RETENTION_NAME_PRICE_EXPERIMENT_KEY = 'retention-name-price-v1';
export const RETENTION_NAME_PRICE_CENTS = [499, 599, 799, 999] as const;
export const RETENTION_NAME_PRICE_DEFAULT_CENTS = 599;
export const RETENTION_NAME_PRICE_CREDITS = 10;

export type RetentionNamePriceCents =
  (typeof RETENTION_NAME_PRICE_CENTS)[number];

export function retentionNamePriceProductId(cents: RetentionNamePriceCents) {
  return `single_retention_name_${cents}`;
}

export const RETENTION_NAME_PRICE_PRODUCT_IDS = RETENTION_NAME_PRICE_CENTS.map(
  (cents) => retentionNamePriceProductId(cents)
);

export const RETENTION_OFFER_PRODUCT_IDS = [
  VIDEO_RETENTION_PRODUCT_ID,
  ...RETENTION_NAME_PRICE_PRODUCT_IDS,
] as const;

export function isRetentionOfferProduct(productId: string | null | undefined) {
  return (
    !!productId &&
    (RETENTION_OFFER_PRODUCT_IDS as readonly string[]).includes(productId)
  );
}

export function retentionNamePriceCents(productId: string) {
  const match = /^single_retention_name_(499|599|799|999)$/.exec(productId);
  return match ? (Number(match[1]) as RetentionNamePriceCents) : null;
}

export function isRetentionNamePriceProduct(productId: string) {
  return retentionNamePriceCents(productId) != null;
}

/** Stripe line-item copy for a retention checkout. Catalog rows stay as stored. */
export function retentionCheckoutLabel(productId: string, locale: string) {
  const cents = retentionNamePriceCents(productId);
  const price = cents ? `$${(cents / 100).toFixed(2)}` : '';
  if (locale === 'zh') {
    return {
      productName: price ? `AIGifMeme 积分 · ${price}` : 'AIGifMeme 积分',
      description: '一次购买：10 积分。请在 30 分钟内开始付款。没有订阅。',
    };
  }
  if (locale === 'es') {
    return {
      productName: price
        ? `Créditos de AIGifMeme · ${price}`
        : 'Créditos de AIGifMeme',
      description:
        'Oferta única: 10 créditos. Inicia el pago en 30 minutos. Sin suscripción.',
    };
  }
  if (locale === 'ar') {
    return {
      productName: price ? `أرصدة AIGifMeme · ${price}` : 'أرصدة AIGifMeme',
      description:
        'شراء لمرة واحدة: 10 أرصدة. ابدأ الدفع خلال 30 دقيقة. بدون اشتراك.',
    };
  }
  return {
    productName: price ? `AIGifMeme credits · ${price}` : 'AIGifMeme credits',
    description:
      'One-time offer: 10 credits. Start checkout within 30 minutes. No subscription.',
  };
}

/** Snap a typed cent amount onto a chip. Values outside $4.99–$9.99 clamp first. */
export function nearestRetentionNamePriceCents(
  cents: number
): RetentionNamePriceCents {
  const clamped = Math.min(
    999,
    Math.max(499, Math.round(Number.isFinite(cents) ? cents : 599))
  );
  let best: RetentionNamePriceCents = RETENTION_NAME_PRICE_CENTS[0];
  for (const price of RETENTION_NAME_PRICE_CENTS) {
    if (Math.abs(price - clamped) < Math.abs(best - clamped)) best = price;
  }
  return best;
}

export type VideoRetentionCampaign = EffectCampaign;

/** Checkout return anchor for the campaign that issued the offer. */
export function retentionCreateRedirect(campaign: VideoRetentionCampaign) {
  return effectHash(campaign, 'create');
}

export interface VideoRetentionOffer {
  expiresAt: number;
  serverNow: number;
  redirect: string;
  /** Absent on offers issued before campaigns were stored. */
  campaign?: VideoRetentionCampaign;
  priceInCents: number;
  currency: string;
  credits: number;
  creditsValidDays: number;
}

export interface VideoRetentionResponse {
  offer: VideoRetentionOffer | null;
  newlyIssued?: boolean;
  /** Registered users × 6 + 3. Omitted when the live count cannot be read. */
  generatedCount?: number;
}

export function retentionTimeLeft(expiresAt: number, now: number) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}
