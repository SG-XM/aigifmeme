import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { config, order } from '@/config/db/schema';
import { getEnabledTopUpProduct } from '@/modules/top-up-products/service';
import { getUuid } from '@/lib/hash';
import {
  computeDuoUpgrade,
  DUO_UPGRADE_CONFIG_PREFIX,
  DUO_UPGRADE_ELIGIBLE_PRODUCT_IDS,
  DUO_UPGRADE_TARGET_PRODUCT_ID,
  standardVideoCount,
  type DuoUpgradeResponse,
} from '@/lib/duo-upgrade';

interface OfferState {
  userId: string;
  originalOrderNo: string;
  shownAt: number;
  checkout: 'available' | 'creating' | 'ready';
  token?: string;
  lockedAt?: number;
  checkoutUrl?: string;
  upgradeOrderNo?: string;
}

const keyFor = (originalOrderNo: string) =>
  DUO_UPGRADE_CONFIG_PREFIX + originalOrderNo;

async function readState(originalOrderNo: string) {
  const [row] = await db()
    .select()
    .from(config)
    .where(eq(config.name, keyFor(originalOrderNo)))
    .limit(1);
  if (!row?.value) return null;
  return { raw: row.value as string, state: JSON.parse(row.value) as OfferState };
}

export async function getDuoProduct() {
  return getEnabledTopUpProduct(DUO_UPGRADE_TARGET_PRODUCT_ID);
}

/** Latest paid, eligible single purchase for this user, if still upgradable. */
export async function findEligibleOriginal(userId: string) {
  const duo = await getDuoProduct();
  if (!duo) return null;
  // Already owning Duo (outright or via a paid upgrade) ends the offer.
  const [ownedDuo] = await db()
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        eq(order.userId, userId),
        eq(order.status, 'paid'),
        inArray(order.productId, [DUO_UPGRADE_TARGET_PRODUCT_ID, 'duo_upgrade_v2'])
      )
    )
    .limit(1);
  if (ownedDuo) return null;

  const [original] = await db()
    .select()
    .from(order)
    .where(
      and(
        eq(order.userId, userId),
        eq(order.status, 'paid'),
        inArray(order.productId, [...DUO_UPGRADE_ELIGIBLE_PRODUCT_IDS])
      )
    )
    .orderBy(desc(order.paidAt))
    .limit(1);
  if (!original) return null;

  const state = await readState(original.orderNo);
  if (state?.state.upgradeOrderNo) {
    const [upgrade] = await db()
      .select({ status: order.status })
      .from(order)
      .where(eq(order.orderNo, state.state.upgradeOrderNo))
      .limit(1);
    if (upgrade?.status === 'paid') return null;
  }

  const paidInCents = original.paymentAmount ?? original.amount;
  const paidAtMs = original.paidAt ? new Date(original.paidAt).getTime() : null;
  const math = computeDuoUpgrade({
    duoPriceInCents: duo.priceInCents,
    duoCredits: duo.credits,
    originalAmountInCents: paidInCents,
    originalCredits: original.creditsAmount ?? 0,
    originalCurrency: original.paymentCurrency || original.currency,
    duoCurrency: duo.currency,
    originalPaidAtMs: paidAtMs,
    nowMs: Date.now(),
  });
  if (!math) return null;
  return { original, duo, paidInCents, ...math };
}

function toResponse(
  found: NonNullable<Awaited<ReturnType<typeof findEligibleOriginal>>>
): DuoUpgradeResponse {
  const now = Date.now();
  return {
    offer: {
      originalOrderNo: found.original.orderNo,
      originalProductId: found.original.productId ?? '',
      paidInCents: found.paidInCents,
      duoPriceInCents: found.duo.priceInCents,
      differenceInCents: found.differenceInCents,
      currency: 'usd',
      originalCredits: found.original.creditsAmount ?? 0,
      duoCredits: found.duo.credits,
      remainingCredits: found.remainingCredits,
      standardVideoCount: standardVideoCount(found.duo.credits),
      expiresAt: (found.original.paidAt ? new Date(found.original.paidAt).getTime() : now) + 24 * 3600_000,
      serverNow: now,
    },
  };
}

/**
 * GET claims the one showing per original order: the insert only succeeds
 * once, so reloads, other tabs and other devices never see the popup again.
 */
export async function claimDuoUpgradeOffer(
  userId: string
): Promise<DuoUpgradeResponse> {
  const found = await findEligibleOriginal(userId);
  if (!found) return { offer: null };
  const inserted = await db()
    .insert(config)
    .values({
      name: keyFor(found.original.orderNo),
      value: JSON.stringify({
        userId,
        originalOrderNo: found.original.orderNo,
        shownAt: Date.now(),
        checkout: 'available',
      } satisfies OfferState),
    })
    .onConflictDoNothing()
    .returning({ name: config.name });
  return inserted.length ? toResponse(found) : { offer: null };
}

/** Compare-and-set checkout claim, mirroring the retention-offer pattern. */
export async function reserveDuoUpgradeCheckout(
  userId: string,
  originalOrderNo: string
) {
  const found = await findEligibleOriginal(userId);
  if (!found || found.original.orderNo !== originalOrderNo)
    throw new Error('This upgrade is no longer available.');
  const saved = await readState(originalOrderNo);
  if (!saved || saved.state.userId !== userId)
    throw new Error('This upgrade is no longer available.');
  if (saved.state.checkout === 'ready' && saved.state.checkoutUrl)
    return { ...found, checkoutUrl: saved.state.checkoutUrl };
  if (
    saved.state.checkout !== 'available' &&
    !(
      saved.state.checkout === 'creating' &&
      (saved.state.lockedAt ?? 0) + 30_000 <= Date.now()
    )
  )
    throw new Error('Your checkout is being prepared. Please try again shortly.');
  const token = saved.state.token || getUuid();
  const locked = JSON.stringify({
    ...saved.state,
    checkout: 'creating',
    token,
    lockedAt: Date.now(),
  });
  const changed = await db()
    .update(config)
    .set({ value: locked })
    .where(and(eq(config.name, keyFor(originalOrderNo)), eq(config.value, saved.raw)))
    .returning({ name: config.name });
  if (!changed.length)
    throw new Error('Your checkout is being prepared. Please try again shortly.');
  return { ...found, token, locked };
}

export async function finishDuoUpgradeCheckout(
  originalOrderNo: string,
  locked: string,
  checkoutUrl: string,
  upgradeOrderNo: string
) {
  const state = JSON.parse(locked) as OfferState;
  await db()
    .update(config)
    .set({
      value: JSON.stringify({ ...state, checkout: 'ready', checkoutUrl, upgradeOrderNo }),
    })
    .where(and(eq(config.name, keyFor(originalOrderNo)), eq(config.value, locked)));
}

export async function recoverDuoUpgradeCheckout(
  originalOrderNo: string,
  locked: string
) {
  const state = JSON.parse(locked) as OfferState;
  await db()
    .update(config)
    .set({ value: JSON.stringify({ ...state, checkout: 'available' }) })
    .where(and(eq(config.name, keyFor(originalOrderNo)), eq(config.value, locked)));
}
