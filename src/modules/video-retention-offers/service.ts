import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { config, creditTopUpProduct, order } from '@/config/db/schema';
import type { EffectCampaign } from '@/lib/ai-video-paths';
import { getUuid } from '@/lib/hash';
import {
  isRetentionOfferProduct,
  RETENTION_OFFER_PRODUCT_IDS,
  VIDEO_RETENTION_CONFIG_PREFIX,
  VIDEO_RETENTION_DURATION_MS,
  VIDEO_RETENTION_PRODUCT_ID,
  type VideoRetentionResponse,
} from '@/lib/video-retention-offer';

interface OfferState {
  expiresAt: number;
  redirect: string;
  /** Omitted on offers issued before peeper joined the campaign enum. */
  campaign?: EffectCampaign;
  checkout: 'available' | 'creating' | 'ready';
  token?: string;
  /** Catalog product reserved for the in-flight checkout. */
  productId?: string;
  lockedAt?: number;
  checkoutUrl?: string;
}

const keyFor = (userId: string) => VIDEO_RETENTION_CONFIG_PREFIX + userId;

function storedCampaign(state: OfferState) {
  return state.campaign ? { campaign: state.campaign } : {};
}

async function readState(userId: string) {
  const [row] = await db()
    .select()
    .from(config)
    .where(eq(config.name, keyFor(userId)))
    .limit(1);
  if (!row?.value) return null;
  return {
    raw: row.value as string,
    state: JSON.parse(row.value) as OfferState,
  };
}

async function purchased(userId: string) {
  const [paid] = await db()
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        eq(order.userId, userId),
        inArray(order.productId, [...RETENTION_OFFER_PRODUCT_IDS]),
        eq(order.status, 'paid')
      )
    )
    .limit(1);
  return !!paid;
}

export async function getRetentionProduct() {
  const [product] = await db()
    .select()
    .from(creditTopUpProduct)
    .where(
      and(
        eq(creditTopUpProduct.productId, VIDEO_RETENTION_PRODUCT_ID),
        eq(creditTopUpProduct.enabled, true)
      )
    )
    .limit(1);
  return product ?? null;
}

export async function getVideoRetentionOffer(
  userId: string
): Promise<VideoRetentionResponse> {
  const saved = await readState(userId);
  const now = Date.now();
  if (!saved || saved.state.expiresAt <= now || (await purchased(userId)))
    return { offer: null };
  const product = await getRetentionProduct();
  if (!product) return { offer: null };
  return {
    offer: {
      expiresAt: saved.state.expiresAt,
      serverNow: now,
      redirect: saved.state.redirect,
      ...storedCampaign(saved.state),
      priceInCents: product.priceInCents,
      currency: product.currency,
      credits: product.credits,
      creditsValidDays: product.creditsValidDays,
    },
  };
}

/** Unique config key makes issuance once per account, even across tabs/devices. */
export async function issueVideoRetentionOffer(
  userId: string,
  redirect: string,
  campaign?: EffectCampaign
) {
  const state: OfferState = {
    expiresAt: Date.now() + VIDEO_RETENTION_DURATION_MS,
    redirect,
    ...(campaign ? { campaign } : {}),
    checkout: 'available',
  };
  const inserted = await db()
    .insert(config)
    .values({ name: keyFor(userId), value: JSON.stringify(state) })
    .onConflictDoNothing()
    .returning({ name: config.name });
  return {
    ...(await getVideoRetentionOffer(userId)),
    newlyIssued: inserted.length > 0,
  };
}

/** Compare-and-set prevents parallel requests creating multiple discount checkouts. */
export async function reserveRetentionCheckout(
  userId: string,
  productId = VIDEO_RETENTION_PRODUCT_ID
) {
  if (!isRetentionOfferProduct(productId))
    throw new Error('This offer has expired or has already been used.');
  const saved = await readState(userId);
  if (
    !saved ||
    saved.state.expiresAt <= Date.now() ||
    (await purchased(userId))
  )
    throw new Error('This offer has expired or has already been used.');
  const currentProduct = saved.state.productId || VIDEO_RETENTION_PRODUCT_ID;
  if (
    saved.state.checkout === 'ready' &&
    saved.state.checkoutUrl &&
    currentProduct === productId
  )
    return { checkoutUrl: saved.state.checkoutUrl };
  const leaseExpired =
    saved.state.checkout === 'creating' &&
    (saved.state.lockedAt ?? 0) + 30_000 <= Date.now();
  const switching =
    saved.state.checkout === 'ready' && currentProduct !== productId;
  if (saved.state.checkout !== 'available' && !leaseExpired && !switching)
    throw new Error(
      'Your checkout is being prepared. Please try again shortly.'
    );
  const token =
    !switching && saved.state.token && currentProduct === productId
      ? saved.state.token
      : getUuid();
  const locked = JSON.stringify({
    expiresAt: saved.state.expiresAt,
    redirect: saved.state.redirect,
    ...storedCampaign(saved.state),
    checkout: 'creating',
    token,
    productId,
    lockedAt: Date.now(),
  });
  const changed = await db()
    .update(config)
    .set({ value: locked })
    .where(and(eq(config.name, keyFor(userId)), eq(config.value, saved.raw)))
    .returning({ name: config.name });
  if (!changed.length)
    throw new Error(
      'Your checkout is being prepared. Please try again shortly.'
    );
  return { token, locked, state: saved.state };
}

export async function finishRetentionCheckout(
  userId: string,
  locked: string,
  checkoutUrl: string
) {
  const state = JSON.parse(locked) as OfferState;
  await db()
    .update(config)
    .set({
      value: JSON.stringify({ ...state, checkout: 'ready', checkoutUrl }),
    })
    .where(and(eq(config.name, keyFor(userId)), eq(config.value, locked)));
}

export async function recoverRetentionCheckout(userId: string, locked: string) {
  // A persisted checkout always wins, including when storing its offer state failed.
  const state = JSON.parse(locked) as OfferState;
  const orderNo = state.token ? `retention_${state.token}` : '';
  const [existing] = orderNo
    ? await db()
        .select({ checkoutUrl: order.checkoutUrl })
        .from(order)
        .where(and(eq(order.userId, userId), eq(order.orderNo, orderNo)))
        .limit(1)
    : [];
  if (existing?.checkoutUrl) {
    await finishRetentionCheckout(userId, locked, existing.checkoutUrl);
    return;
  }
  await db()
    .update(config)
    .set({
      value: JSON.stringify({
        ...state,
        checkout: 'available',
      }),
    })
    .where(and(eq(config.name, keyFor(userId)), eq(config.value, locked)));
}
