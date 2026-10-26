import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import { db } from '@/core/db';
import {
  config as appConfig,
  creditTopUpProduct,
  emailRecall,
  emailRecallSuppression,
  funnelEvent,
  order,
  subscriptionPlan,
  user,
  type EmailRecall,
} from '@/config/db/schema';
import {
  dueRecall,
  parseRecallCounter,
  RECALL_CANDIDATE_WINDOW,
  RECALL_CHECKOUT_CACHE,
  RECALL_DAILY_COUNTER_KEY,
  RECALL_LINK_LIFETIME,
  RECALL_MONTHLY_COUNTER_KEY,
  RECALL_SEND_BATCH,
  recallLocale,
  recallUtcDayPeriod,
  recallUtcDayRange,
  recallUtcMonthPeriod,
  recallUtcMonthRange,
  type RecallKind,
  type RecallSendLimits,
} from '@/lib/email-recall';
import { readRecallToken, recallEmailKey } from '@/lib/email-recall-token';
import { recordFunnelEvent } from '@/lib/funnel';
import { getUuid } from '@/lib/hash';
import {
  isRetentionOfferProduct,
  RETENTION_OFFER_PRODUCT_IDS,
} from '@/lib/video-retention-offer';

export async function hasRecallPayment(userId: string, email: string) {
  const [paid] = await db()
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        or(
          eq(order.userId, userId),
          sql`lower(${order.userEmail}) = ${email.trim().toLowerCase()}`
        ),
        eq(order.isTest, false),
        or(eq(order.status, 'paid'), isNotNull(order.paymentConfirmedAt))
      )
    )
    .limit(1);
  return !!paid;
}
export async function isRecallSuppressed(email: string) {
  const [row] = await db()
    .select()
    .from(emailRecallSuppression)
    .where(eq(emailRecallSuppression.emailKey, recallEmailKey(email)))
    .limit(1);
  return !!row;
}
export async function suppressRecall(email: string, reason: string) {
  const emailKey = recallEmailKey(email);
  try {
    await db().insert(emailRecallSuppression).values({ emailKey, reason });
  } catch (error) {
    if (!(await isRecallSuppressed(email))) throw error;
  }
  await db()
    .update(emailRecall)
    .set({ unsubscribedAt: new Date() })
    .where(eq(emailRecall.emailKey, emailKey));
}
export async function getRecallByToken(
  token: unknown,
  purpose: 'checkout' | 'unsubscribe' = 'checkout'
): Promise<EmailRecall | null> {
  const id = readRecallToken(token, purpose);
  if (!id) return null;
  const [row] = await db()
    .select()
    .from(emailRecall)
    .where(eq(emailRecall.id, id))
    .limit(1);
  return row ?? null;
}
export async function getRecallProduct(productId: string) {
  if (isRetentionOfferProduct(productId)) return null;
  const [plan] = await db()
    .select()
    .from(subscriptionPlan)
    .where(
      and(
        eq(subscriptionPlan.productId, productId),
        eq(subscriptionPlan.enabled, true)
      )
    )
    .limit(1);
  if (plan)
    return {
      productId: plan.productId,
      name: plan.nameEn,
      nameEs: plan.nameEs || plan.nameEn,
      amount: plan.priceInCents,
      currency: plan.currency,
      subscription: true,
      interval: plan.interval,
    };
  const [topup] = await db()
    .select()
    .from(creditTopUpProduct)
    .where(
      and(
        eq(creditTopUpProduct.productId, productId),
        eq(creditTopUpProduct.enabled, true)
      )
    )
    .limit(1);
  return topup
    ? {
        productId: topup.productId,
        name: topup.name,
        nameEs: topup.nameEs || topup.name,
        amount: topup.priceInCents,
        currency: topup.currency,
        subscription: false,
        interval: null,
      }
    : null;
}
async function lowestRecallProduct() {
  const [product] = await db()
    .select()
    .from(creditTopUpProduct)
    .where(
      and(
        eq(creditTopUpProduct.enabled, true),
        notInArray(creditTopUpProduct.productId, [
          ...RETENTION_OFFER_PRODUCT_IDS,
        ]),
        eq(creditTopUpProduct.currency, 'usd')
      )
    )
    .orderBy(
      asc(creditTopUpProduct.priceInCents),
      asc(creditTopUpProduct.productId)
    )
    .limit(1);
  return product ?? null;
}
type Candidate = {
  userId: string;
  email: string;
  locale: string;
  kind: RecallKind;
  triggeredAt: Date;
};
export async function findRecallCandidates(
  now = Date.now()
): Promise<Candidate[]> {
  const paid = db()
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        eq(order.userId, user.id),
        eq(order.isTest, false),
        or(eq(order.status, 'paid'), isNotNull(order.paymentConfirmedAt))
      )
    );
  const claimed = db()
    .select({ id: emailRecall.id })
    .from(emailRecall)
    .where(eq(emailRecall.userId, user.id));
  const occupied = await db()
    .select({ key: emailRecall.emailKey })
    .from(emailRecall);
  const suppressed = await db()
    .select({ key: emailRecallSuppression.emailKey })
    .from(emailRecallSuppression);
  const excluded = new Set<string>(
    [...occupied, ...suppressed].map((r: { key: string }) => r.key)
  );
  const result: Candidate[] = [];
  for (let offset = 0; ; offset += 250) {
    const rows = await db()
      .select({
        userId: user.id,
        email: user.email,
        locale: user.locale,
        paywallAt: sql`max(case when ${funnelEvent.eventName} = 'paywall_shown' then ${funnelEvent.createdAt} else null end)`,
      })
      .from(user)
      .innerJoin(funnelEvent, eq(funnelEvent.userId, user.id))
      .where(
        and(
          eq(user.emailVerified, true),
          notExists(paid),
          notExists(claimed),
          gte(funnelEvent.createdAt, new Date(now - RECALL_CANDIDATE_WINDOW)),
          inArray(funnelEvent.eventName, ['paywall_shown', 'checkout_created'])
        )
      )
      .groupBy(user.id, user.email, user.locale)
      .orderBy(asc(sql`max(${funnelEvent.createdAt})`))
      .limit(250)
      .offset(offset);
    for (const row of rows as Array<{
      userId: string;
      email: string;
      locale: string;
      paywallAt: string | number | Date | null;
    }>) {
      if (excluded.has(recallEmailKey(row.email))) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) continue;
      const [latest] = await db()
        .select()
        .from(order)
        .where(
          and(
            eq(order.userId, row.userId),
            eq(order.checkoutSource, 'site'),
            gte(order.createdAt, new Date(now - RECALL_CANDIDATE_WINDOW)),
            eq(order.isTest, false),
            isNull(order.deletedAt)
          )
        )
        .orderBy(desc(order.createdAt))
        .limit(1);
      const timing = dueRecall(
        latest?.createdAt ?? null,
        row.paywallAt === null ? null : new Date(row.paywallAt),
        now
      );
      const selectedProductId =
        latest?.productId && !isRetentionOfferProduct(latest.productId)
          ? latest.productId
          : (await lowestRecallProduct())?.productId;
      if (!selectedProductId || !(await getRecallProduct(selectedProductId)))
        continue;
      if (
        !timing ||
        (await isRecallSuppressed(row.email)) ||
        (await hasRecallPayment(row.userId, row.email))
      )
        continue;
      result.push({
        userId: row.userId,
        email: row.email,
        locale: row.locale,
        ...timing,
      });
      if (result.length >= 25) return result;
    }
    if (rows.length < 250) break;
  }
  return result;
}

/** Both segments share one durable account/email slot, even when copy changes. */
export async function issueRecall(
  candidate: Candidate
): Promise<EmailRecall | null> {
  const email = candidate.email.trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (await isRecallSuppressed(email)) ||
    (await hasRecallPayment(candidate.userId, email))
  )
    return null;
  const condition = or(
    eq(emailRecall.userId, candidate.userId),
    eq(emailRecall.emailKey, recallEmailKey(email))
  );
  const [existing] = await db()
    .select()
    .from(emailRecall)
    .where(condition)
    .limit(1);
  if (existing) return existing.userId === candidate.userId ? existing : null;
  const [latest] =
    candidate.kind === 'checkout'
      ? await db()
          .select()
          .from(order)
          .where(
            and(
              eq(order.userId, candidate.userId),
              eq(order.checkoutSource, 'site'),
              eq(order.isTest, false),
              isNull(order.deletedAt)
            )
          )
          .orderBy(desc(order.createdAt))
          .limit(1)
      : [];
  const fallback =
    !latest || isRetentionOfferProduct(latest.productId)
      ? await lowestRecallProduct()
      : null;
  const productId = fallback?.productId || latest?.productId;
  if (!productId || !(await getRecallProduct(productId))) return null;
  const id = getUuid();
  try {
    await db()
      .insert(emailRecall)
      .values({
        id,
        userId: candidate.userId,
        emailKey: recallEmailKey(email),
        recipientEmail: email,
        locale: recallLocale(candidate.locale),
        kind: candidate.kind,
        productId,
        paymentProvider: fallback ? null : latest?.paymentProvider || null,
        originalOrderNo: latest?.orderNo || null,
        triggeredAt: candidate.triggeredAt,
        expiresAt: new Date(Date.now() + RECALL_LINK_LIFETIME),
      });
  } catch (error) {
    const [winner] = await db()
      .select()
      .from(emailRecall)
      .where(condition)
      .limit(1);
    if (!winner) throw error;
    return winner.userId === candidate.userId ? winner : null;
  }
  const [created] = await db()
    .select()
    .from(emailRecall)
    .where(eq(emailRecall.id, id))
    .limit(1);
  return created ?? null;
}
export async function ownedRecall(token: unknown, userId: string) {
  const row = await getRecallByToken(token);
  if (!row || row.userId !== userId) throw new Error('Invalid recall link');
  if (row.expiresAt.getTime() <= Date.now())
    throw new Error('This recall link has expired');
  if (row.unsubscribedAt || (await isRecallSuppressed(row.recipientEmail)))
    throw new Error('This recall link is unavailable');
  const [owner] = await db()
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!owner || recallEmailKey(owner.email) !== row.emailKey)
    throw new Error('This recall link belongs to another account');
  if (await hasRecallPayment(userId, row.recipientEmail))
    throw new Error('This account has already completed a payment');
  return row;
}
/** Re-read the CAS token: MySQL's emulated returning() is not a lock result. */
export async function reserveRecallCheckout(token: unknown, userId: string) {
  const row = await ownedRecall(token, userId);
  const now = Date.now();
  if (!row.clickedAt) {
    await db()
      .update(emailRecall)
      .set({ clickedAt: new Date(now) })
      .where(and(eq(emailRecall.id, row.id), isNull(emailRecall.clickedAt)));
    await recordFunnelEvent('recall_clicked', userId, userId);
  }
  if (
    row.checkoutUrl &&
    row.lastCheckoutAt &&
    now - row.lastCheckoutAt.getTime() < RECALL_CHECKOUT_CACHE
  )
    return { row, checkoutUrl: row.checkoutUrl, requestId: '', lock: '' };
  if (row.checkoutLockedAt && now - row.checkoutLockedAt.getTime() < 60_000)
    throw new Error(
      'Your checkout is being prepared. Please try again shortly.'
    );
  const lock = getUuid();
  const generation = row.checkoutUrl
    ? row.checkoutGeneration + 1
    : row.checkoutGeneration;
  await db()
    .update(emailRecall)
    .set({
      checkoutLockToken: lock,
      checkoutLockedAt: new Date(now),
      checkoutGeneration: generation,
      checkoutUrl: null,
    })
    .where(
      and(
        eq(emailRecall.id, row.id),
        eq(emailRecall.checkoutGeneration, row.checkoutGeneration),
        row.checkoutLockToken === null
          ? isNull(emailRecall.checkoutLockToken)
          : eq(emailRecall.checkoutLockToken, row.checkoutLockToken)
      )
    );
  const [winner] = await db()
    .select()
    .from(emailRecall)
    .where(eq(emailRecall.id, row.id))
    .limit(1);
  if (winner?.checkoutLockToken !== lock)
    throw new Error(
      'Your checkout is being prepared. Please try again shortly.'
    );
  return {
    row: winner as EmailRecall,
    lock,
    requestId: 'recall_' + row.id + '_' + generation,
  };
}
export async function finishRecallCheckout(
  id: string,
  lock: string,
  checkoutUrl?: string
) {
  await db()
    .update(emailRecall)
    .set({
      checkoutLockToken: null,
      checkoutLockedAt: null,
      ...(checkoutUrl ? { checkoutUrl, lastCheckoutAt: new Date() } : {}),
    })
    .where(
      and(eq(emailRecall.id, id), eq(emailRecall.checkoutLockToken, lock))
    );
}
export async function claimRecallSend(row: EmailRecall) {
  const token = getUuid();
  await db()
    .update(emailRecall)
    .set({ status: 'sending', claimToken: token, attemptedAt: new Date() })
    .where(
      and(
        eq(emailRecall.id, row.id),
        eq(emailRecall.status, 'ready'),
        isNull(emailRecall.unsubscribedAt)
      )
    );
  const [winner] = await db()
    .select()
    .from(emailRecall)
    .where(eq(emailRecall.id, row.id))
    .limit(1);
  return winner?.claimToken === token ? token : null;
}

/** Re-evaluate a queued recipient immediately before reserving its send slot. */
export async function refreshRecallForSend(row: EmailRecall) {
  if (
    !row.userId ||
    row.expiresAt.getTime() <= Date.now() ||
    (await isRecallSuppressed(row.recipientEmail)) ||
    (await hasRecallPayment(row.userId, row.recipientEmail))
  )
    return null;
  const [owner] = await db()
    .select()
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1);
  if (!owner?.emailVerified || recallEmailKey(owner.email) !== row.emailKey)
    return null;
  const [latest] = await db()
    .select()
    .from(order)
    .where(
      and(
        eq(order.userId, row.userId),
        eq(order.checkoutSource, 'site'),
        eq(order.isTest, false),
        isNull(order.deletedAt),
        gte(order.createdAt, new Date(Date.now() - RECALL_LINK_LIFETIME))
      )
    )
    .orderBy(desc(order.createdAt))
    .limit(1);
  const [paywall] = await db()
    .select()
    .from(funnelEvent)
    .where(
      and(
        eq(funnelEvent.userId, row.userId),
        eq(funnelEvent.eventName, 'paywall_shown')
      )
    )
    .orderBy(desc(funnelEvent.createdAt))
    .limit(1);
  const timing = dueRecall(
    latest?.createdAt ?? null,
    paywall?.createdAt ?? null
  );
  if (!timing) return { wait: true as const };
  const productId = isRetentionOfferProduct(latest?.productId)
    ? row.productId
    : latest?.productId || row.productId;
  if (!(await getRecallProduct(productId))) return null;
  const values = {
    kind: timing.kind,
    productId,
    triggeredAt: timing.triggeredAt,
    paymentProvider:
      latest?.productId === productId
        ? latest.paymentProvider
        : row.paymentProvider,
    originalOrderNo: latest?.orderNo || row.originalOrderNo,
  };
  await db()
    .update(emailRecall)
    .set(values)
    .where(and(eq(emailRecall.id, row.id), eq(emailRecall.status, 'ready')));
  return { ...row, ...values };
}
function affectedRows(result: unknown): number {
  const record = result as {
    rowsAffected?: number;
    rowCount?: number;
    affectedRows?: number;
    count?: number;
    meta?: { changes?: number };
    0?: { affectedRows?: number; rowCount?: number };
  };
  const candidates = [
    record?.rowsAffected,
    record?.rowCount,
    record?.affectedRows,
    record?.count,
    record?.meta?.changes,
    record?.[0]?.affectedRows,
    record?.[0]?.rowCount,
  ];
  const value = candidates.find((candidate) =>
    Number.isFinite(Number(candidate))
  );
  return value === undefined ? 0 : Number(value);
}

async function readCounter(key: string) {
  const [row] = await db()
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.name, key))
    .limit(1);
  return row?.value ?? null;
}

async function insertCounter(key: string, value: string) {
  try {
    await db().insert(appConfig).values({ name: key, value });
    return true;
  } catch {
    return false;
  }
}

async function compareAndSet(key: string, expected: string, next: string) {
  const result = await db()
    .update(appConfig)
    .set({ value: next })
    .where(and(eq(appConfig.name, key), eq(appConfig.value, expected)));
  return affectedRows(result) === 1;
}

/** Sent rows plus in-flight or uncertain attempts. Used only to seed a period. */
async function countRecallSends(range: { start: Date; end: Date }) {
  const [row] = await db()
    .select({ total: count() })
    .from(emailRecall)
    .where(
      or(
        and(
          eq(emailRecall.status, 'sent'),
          gte(emailRecall.sentAt, range.start),
          lt(emailRecall.sentAt, range.end)
        ),
        and(
          inArray(emailRecall.status, ['uncertain', 'sending']),
          gte(emailRecall.attemptedAt, range.start),
          lt(emailRecall.attemptedAt, range.end)
        )
      )
    );
  return Number(row?.total ?? 0);
}

async function reservedCount(
  key: string,
  period: string,
  seed: () => Promise<number>
) {
  const parsed = parseRecallCounter(await readCounter(key));
  return parsed?.period === period ? parsed.count : seed();
}

async function reserveCounter(
  key: string,
  period: string,
  limit: number,
  seed: () => Promise<number>
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const raw = await readCounter(key);
    const parsed = parseRecallCounter(raw);
    const inPeriod = parsed?.period === period;
    const current = inPeriod ? parsed.count : await seed();
    if (current >= limit) {
      if (!inPeriod) {
        const seeded = `${period}:${current}`;
        const persisted =
          raw === null
            ? await insertCounter(key, seeded)
            : await compareAndSet(key, raw, seeded);
        if (!persisted) continue;
      }
      return false;
    }
    const next = `${period}:${current + 1}`;
    const persisted =
      raw === null
        ? await insertCounter(key, next)
        : await compareAndSet(key, raw, next);
    if (persisted) return true;
  }
  return false;
}

async function releaseCounter(key: string, period: string) {
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const raw = await readCounter(key);
      const parsed = parseRecallCounter(raw);
      if (!raw || !parsed || parsed.period !== period || parsed.count <= 0)
        return;
      if (await compareAndSet(key, raw, `${period}:${parsed.count - 1}`))
        return;
    }
  } catch {
    /* A missed release under-sends. It must not throw open the cap. */
  }
}

/** How many provider calls this run may start. Each call still reserves. */
export async function recallSendAllowance(
  limits: RecallSendLimits,
  now = new Date()
) {
  const [daily, monthly] = await Promise.all([
    reservedCount(RECALL_DAILY_COUNTER_KEY, recallUtcDayPeriod(now), () =>
      countRecallSends(recallUtcDayRange(now))
    ),
    reservedCount(RECALL_MONTHLY_COUNTER_KEY, recallUtcMonthPeriod(now), () =>
      countRecallSends(recallUtcMonthRange(now))
    ),
  ]);
  return Math.max(
    0,
    Math.min(RECALL_SEND_BATCH, limits.daily - daily, limits.monthly - monthly)
  );
}

/**
 * Claim one daily and one monthly slot before contacting Resend.
 * Compare-and-swap so overlapping cron runs cannot pass the cap.
 */
export async function reserveRecallSend(
  limits: RecallSendLimits,
  now = new Date()
) {
  const daily = await reserveCounter(
    RECALL_DAILY_COUNTER_KEY,
    recallUtcDayPeriod(now),
    limits.daily,
    () => countRecallSends(recallUtcDayRange(now))
  );
  if (!daily) return false;
  const monthly = await reserveCounter(
    RECALL_MONTHLY_COUNTER_KEY,
    recallUtcMonthPeriod(now),
    limits.monthly,
    () => countRecallSends(recallUtcMonthRange(now))
  );
  if (!monthly) {
    await releaseCounter(RECALL_DAILY_COUNTER_KEY, recallUtcDayPeriod(now));
    return false;
  }
  return true;
}

/** Give the slot back when Resend did not accept the email. */
export async function releaseRecallSendReservation(now = new Date()) {
  await releaseCounter(RECALL_DAILY_COUNTER_KEY, recallUtcDayPeriod(now));
  await releaseCounter(RECALL_MONTHLY_COUNTER_KEY, recallUtcMonthPeriod(now));
}

/** Return a claimed row to ready after a quota rejection. The email was not accepted. */
export async function releaseRecallSend(id: string, claim: string) {
  await db()
    .update(emailRecall)
    .set({
      status: 'ready',
      claimToken: null,
      lastError: 'Resend quota exceeded; retry on the next UTC day',
    })
    .where(
      and(
        eq(emailRecall.id, id),
        eq(emailRecall.status, 'sending'),
        eq(emailRecall.claimToken, claim)
      )
    );
}

export async function markRecallSend(
  id: string,
  claim: string,
  resendId?: string
) {
  await db()
    .update(emailRecall)
    .set({
      status: resendId ? 'sent' : 'uncertain',
      resendId: resendId || null,
      sentAt: resendId ? new Date() : null,
      lastError: resendId
        ? null
        : 'Provider result unavailable; review before retrying',
    })
    .where(and(eq(emailRecall.id, id), eq(emailRecall.claimToken, claim)));
}
export async function getRecallStats() {
  const [total] = await db().select({ count: count() }).from(emailRecall);
  const grouped = await db()
    .select({ status: emailRecall.status, count: count() })
    .from(emailRecall)
    .groupBy(emailRecall.status);
  const [clicked] = await db()
    .select({ count: count() })
    .from(emailRecall)
    .where(isNotNull(emailRecall.clickedAt));
  const [checkout] = await db()
    .select({ count: sql`count(distinct ${order.recallId})` })
    .from(order)
    .where(
      and(eq(order.checkoutSource, 'email_recall'), eq(order.isTest, false))
    );
  const payments = await db()
    .select({
      currency: order.currency,
      people: sql`count(distinct ${order.recallId})`,
      amount: sql`coalesce(sum(${order.paymentAmount}), 0)`,
    })
    .from(order)
    .where(
      and(
        eq(order.checkoutSource, 'email_recall'),
        eq(order.isTest, false),
        isNotNull(order.paymentConfirmedAt)
      )
    )
    .groupBy(order.currency);
  const recent = await db()
    .select({
      id: emailRecall.id,
      email: emailRecall.recipientEmail,
      kind: emailRecall.kind,
      locale: emailRecall.locale,
      status: emailRecall.status,
      createdAt: emailRecall.createdAt,
      sentAt: emailRecall.sentAt,
      clickedAt: emailRecall.clickedAt,
    })
    .from(emailRecall)
    .orderBy(desc(emailRecall.createdAt))
    .limit(20);
  return {
    total: Number(total?.count || 0),
    statuses: Object.fromEntries(
      grouped.map((r: { status: string; count: number }) => [
        r.status,
        Number(r.count),
      ])
    ),
    clicked: Number(clicked?.count || 0),
    checkouts: Number(checkout?.count || 0),
    payments: payments.map(
      (p: { currency: string; people: number; amount: number }) => ({
        currency: p.currency,
        people: Number(p.people),
        amount: Number(p.amount),
      })
    ),
    recent,
  };
}
