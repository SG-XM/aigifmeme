/**
 * Post-purchase Duo Pack upgrade: a paid single-video pack can be topped up
 * to the Duo Pack by paying only the price difference, once, shortly after
 * the original purchase. All money/credit math lives here so it can be
 * unit-tested without a database.
 */
import { STANDARD_VIDEO_CREDITS } from './video-pricing';
import {
  RETENTION_NAME_PRICE_PRODUCT_IDS,
  VIDEO_RETENTION_PRODUCT_ID,
} from './video-retention-offer';

/** Synthetic checkout product id; never a catalog row. Resolved server-side. */
export const DUO_UPGRADE_PRODUCT_ID = 'duo_upgrade_v2';
export const DUO_UPGRADE_TARGET_PRODUCT_ID = 'duo_v2';
/** Single-video packs eligible for the upgrade (each grants 10 credits). */
export const DUO_UPGRADE_ELIGIBLE_PRODUCT_IDS = [
  'single_v2',
  VIDEO_RETENTION_PRODUCT_ID,
  ...RETENTION_NAME_PRICE_PRODUCT_IDS,
] as const;
/** Offer is shown right after purchase; keep eligibility to one day. */
export const DUO_UPGRADE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DUO_UPGRADE_CONFIG_PREFIX = 'duo_upgrade_offer:';

export interface DuoUpgradeOffer {
  originalOrderNo: string;
  originalProductId: string;
  paidInCents: number;
  duoPriceInCents: number;
  differenceInCents: number;
  currency: string;
  originalCredits: number;
  duoCredits: number;
  remainingCredits: number;
  /** Whole Standard (720p, 12s) videos the full Duo Pack pays for. */
  standardVideoCount: number;
  expiresAt: number;
  serverNow: number;
}

export interface DuoUpgradeResponse {
  offer: DuoUpgradeOffer | null;
}

export function computeDuoUpgrade(input: {
  duoPriceInCents: number;
  duoCredits: number;
  originalAmountInCents: number;
  originalCredits: number;
  originalCurrency: string;
  duoCurrency: string;
  originalPaidAtMs: number | null;
  nowMs: number;
}): { differenceInCents: number; remainingCredits: number } | null {
  const paid = input.originalAmountInCents;
  if (
    !Number.isSafeInteger(paid) ||
    paid <= 0 ||
    input.originalCurrency.toLowerCase() !== 'usd' ||
    input.duoCurrency.toLowerCase() !== 'usd' ||
    !input.originalPaidAtMs ||
    input.originalPaidAtMs > input.nowMs ||
    input.nowMs - input.originalPaidAtMs > DUO_UPGRADE_WINDOW_MS
  )
    return null;
  const differenceInCents = input.duoPriceInCents - paid;
  const remainingCredits = input.duoCredits - input.originalCredits;
  if (differenceInCents <= 0 || remainingCredits <= 0) return null;
  return { differenceInCents, remainingCredits };
}

/** 50 Duo credits / 10 credits per Standard video = 5 videos. */
export function standardVideoCount(duoCredits: number): number {
  return Math.floor(duoCredits / STANDARD_VIDEO_CREDITS);
}
