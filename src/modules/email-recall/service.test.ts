import { createClient } from '@libsql/client';
import { eq, is, SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import {
  getTableConfig,
  SQLiteSyncDialect,
  SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import * as schema from '@/config/db/schema';
import {
  dueRecall,
  isRecallQuotaError,
  RECALL_DAILY_COUNTER_KEY,
  RECALL_MONTHLY_COUNTER_KEY,
  recallQuotaPauseUntil,
} from '@/lib/email-recall';
import { recallEmailKey, recallToken } from '@/lib/email-recall-token';

import {
  claimRecallSend,
  findRecallCandidates,
  finishRecallCheckout,
  getRecallStats,
  issueRecall,
  markRecallSend,
  ownedRecall,
  recallSendAllowance,
  releaseRecallSend,
  releaseRecallSendReservation,
  reserveRecallCheckout,
  reserveRecallSend,
  suppressRecall,
} from './service';

const state = vi.hoisted(() => ({
  database: null as ReturnType<typeof drizzle> | null,
}));
vi.mock('@/core/db', () => ({ db: () => state.database }));
vi.mock('@/config', () => ({
  envConfigs: {
    auth_secret: 'recall-test-secret-longer-than-thirty-two-characters',
    database_provider: 'sqlite',
  },
  AUTH_SECRET_PLACEHOLDER: 'placeholder',
}));
const client = createClient({ url: ':memory:' });
const tables = Object.values(schema).filter((t) => is(t, SQLiteTable));
const now = Date.now();
beforeAll(async () => {
  const dialect = new SQLiteSyncDialect();
  for (const table of tables) {
    const cfg = getTableConfig(table);
    const columns = cfg.columns.map((c) => {
      let value = '"' + c.name + '" ' + c.getSQLType();
      if (c.primary) value += ' primary key';
      if (c.isUnique) value += ' unique';
      if (c.default !== undefined) {
        const expression = is(c.default, SQL)
          ? dialect.sqlToQuery(c.default).sql
          : typeof c.default === 'string'
            ? "'" + c.default.replaceAll("'", "''") + "'"
            : String(Number(c.default));
        value += ' default ' + expression;
      }
      return value;
    });
    await client.execute(
      'create table "' + cfg.name + '" (' + columns.join(',') + ')'
    );
  }
  state.database = drizzle(client);
});
beforeEach(async () => {
  for (const table of tables)
    await client.execute('delete from "' + getTableConfig(table).name + '"');
  await state.database!.insert(schema.user).values({
    id: 'u1',
    name: 'One',
    email: 'one@example.test',
    emailVerified: true,
    locale: 'es',
  });
  await state.database!.insert(schema.creditTopUpProduct).values([
    {
      productId: 'low',
      name: 'Low',
      nameEs: 'Básico',
      description: 'Pack',
      priceInCents: 499,
      credits: 10,
      enabled: true,
    },
    {
      productId: 'high',
      name: 'High',
      description: 'Pack',
      priceInCents: 999,
      credits: 20,
      enabled: true,
    },
    {
      productId: 'single_retention_v2',
      name: 'Reserved',
      description: 'Restricted',
      priceInCents: 99,
      credits: 5,
      enabled: true,
    },
  ]);
});
afterAll(() => client.close());
function candidate(kind: 'checkout' | 'paywall' = 'paywall') {
  return {
    userId: 'u1',
    email: 'one@example.test',
    locale: 'es',
    kind,
    triggeredAt: new Date(now - 3 * 60 * 60_000),
  };
}
async function siteOrder(
  ageMinutes: number,
  options: Record<string, unknown> = {}
) {
  await state.database!.insert(schema.order).values({
    id: 'order1',
    orderNo: 'SITE1',
    userId: 'u1',
    status: 'created',
    amount: 999,
    currency: 'usd',
    productId: 'high',
    paymentProvider: 'stripe',
    checkoutInfo: '{}',
    createdAt: new Date(now - ageMinutes * 60_000),
    ...options,
  });
}
async function paywall(ageMinutes: number) {
  await state.database!.insert(schema.funnelEvent).values({
    id: 'event1',
    visitorId: 'visitor',
    userId: 'u1',
    eventName: 'paywall_shown',
    createdAt: new Date(now - ageMinutes * 60_000),
  });
}
describe('recall timing and durable recipient cap', () => {
  it('checkout priority cannot fall through to paywall before 30 minutes', () => {
    expect(
      dueRecall(new Date(now - 29 * 60_000), new Date(now - 180 * 60_000), now)
    ).toBeNull();
    expect(dueRecall(null, new Date(now - 119 * 60_000), now)).toBeNull();
    expect(dueRecall(new Date(now - 30 * 60_000), null, now)?.kind).toBe(
      'checkout'
    );
  });
  it('uses the cheapest public pack and excludes reserved retention offers', async () => {
    const row = await issueRecall(candidate());
    expect(row?.productId).toBe('low');
    expect(row?.locale).toBe('es');
  });
  it('reuses one recipient across segments and blocks the same normalized email on another account', async () => {
    const row = await issueRecall(candidate());
    expect((await issueRecall(candidate('checkout')))?.id).toBe(row?.id);
    await state.database!.insert(schema.user).values({
      id: 'u2',
      name: 'Two',
      email: 'ONE@example.test',
      emailVerified: true,
    });
    expect(
      await issueRecall({
        ...candidate(),
        userId: 'u2',
        email: 'ONE@example.test',
      })
    ).toBeNull();
  });
  it('restores the original selected product for checkout recipients', async () => {
    await siteOrder(40);
    expect((await issueRecall(candidate('checkout')))?.productId).toBe('high');
  });
  it('rejects paid accounts and unsubscribed addresses', async () => {
    await siteOrder(40, { status: 'paid', paymentConfirmedAt: new Date() });
    expect(await issueRecall(candidate())).toBeNull();
    await state.database!.delete(schema.order);
    await suppressRecall('ONE@example.test', 'unsubscribed');
    expect(await issueRecall(candidate())).toBeNull();
  });
  it('a recent checkout waits even when an earlier paywall is already due', async () => {
    await paywall(180);
    await siteOrder(10);
    expect(await findRecallCandidates(now)).toEqual([]);
  });
  it('ignores checkout and paywall events older than 24 hours', async () => {
    await paywall(25 * 60);
    expect(await findRecallCandidates(now)).toEqual([]);
    await state.database!.delete(schema.funnelEvent);
    await siteOrder(25 * 60);
    await state.database!.insert(schema.funnelEvent).values({
      id: 'event-old-checkout',
      visitorId: 'visitor',
      userId: 'u1',
      eventName: 'checkout_created',
      createdAt: new Date(now - 25 * 60 * 60_000),
    });
    expect(await findRecallCandidates(now)).toEqual([]);
  });
  it('keeps the 30 minute checkout and 2 hour paywall delays inside 24 hours', async () => {
    await paywall(150);
    expect((await findRecallCandidates(now)).map((r) => r.kind)).toEqual([
      'paywall',
    ]);
    await state.database!.delete(schema.funnelEvent);
    await siteOrder(40);
    await state.database!.insert(schema.funnelEvent).values({
      id: 'event-checkout',
      visitorId: 'visitor',
      userId: 'u1',
      eventName: 'checkout_created',
      createdAt: new Date(now - 40 * 60_000),
    });
    expect((await findRecallCandidates(now)).map((r) => r.kind)).toEqual([
      'checkout',
    ]);
    await state.database!.delete(schema.order);
    await siteOrder(20);
    expect(await findRecallCandidates(now)).toEqual([]);
  });
  it('a months-old checkout does not bypass a fresh paywall delay', async () => {
    await siteOrder(60 * 24 * 30);
    await paywall(5);
    expect(await findRecallCandidates(now)).toEqual([]);
  });
  it('paginates past suppressed recipients rather than starving later eligible users', async () => {
    const users = Array.from({ length: 250 }, (_, i) => ({
      id: 'blocked-' + i,
      name: 'Blocked',
      email: 'blocked-' + i + '@example.test',
      emailVerified: true,
    }));
    await state.database!.insert(schema.user).values(users);
    await state.database!.insert(schema.funnelEvent).values(
      users.map((u) => ({
        id: 'event-' + u.id,
        visitorId: u.id,
        userId: u.id,
        eventName: 'paywall_shown',
        createdAt: new Date(now - 200 * 60_000),
      }))
    );
    await state.database!.insert(schema.emailRecallSuppression).values(
      users.map((u) => ({
        emailKey: recallEmailKey(u.email),
        reason: 'unsubscribed',
      }))
    );
    await paywall(150);
    expect((await findRecallCandidates(now)).map((r) => r.userId)).toEqual([
      'u1',
    ]);
  });
  it('does not let retired checkout products occupy the issuance quota', async () => {
    const users = Array.from({ length: 25 }, (_, i) => ({
      id: 'retired-' + i,
      name: 'Retired',
      email: 'retired-' + i + '@example.test',
      emailVerified: true,
    }));
    await state.database!.insert(schema.user).values(users);
    await state.database!.insert(schema.order).values(
      users.map((u) => ({
        id: 'order-' + u.id,
        orderNo: 'order-' + u.id,
        userId: u.id,
        status: 'created',
        amount: 999,
        currency: 'usd',
        productId: 'disabled-product',
        paymentProvider: 'stripe',
        checkoutInfo: '{}',
        createdAt: new Date(now - 200 * 60_000),
      }))
    );
    await state.database!.insert(schema.funnelEvent).values(
      users.map((u) => ({
        id: 'event-' + u.id,
        visitorId: u.id,
        userId: u.id,
        eventName: 'checkout_created',
        createdAt: new Date(now - 200 * 60_000),
      }))
    );
    await paywall(150);
    expect((await findRecallCandidates(now)).map((r) => r.userId)).toEqual([
      'u1',
    ]);
  });
});
describe('personal checkout links and send claims', () => {
  it('binds checkout links to the authenticated account', async () => {
    const row = (await issueRecall(candidate()))!;
    await expect(
      ownedRecall(recallToken(row.id, 'checkout'), 'other')
    ).rejects.toThrow('Invalid');
    await expect(
      ownedRecall(recallToken(row.id, 'unsubscribe'), 'u1')
    ).rejects.toThrow('Invalid');
  });
  it('concurrent clicks reserve only one checkout and then reuse its URL', async () => {
    const row = (await issueRecall(candidate()))!;
    const token = recallToken(row.id, 'checkout');
    const results = await Promise.allSettled([
      reserveRecallCheckout(token, 'u1'),
      reserveRecallCheckout(token, 'u1'),
    ]);
    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const winner = winners[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof reserveRecallCheckout>>
    >;
    await finishRecallCheckout(
      row.id,
      winner.value.lock,
      'https://checkout.stripe.test/session'
    );
    expect((await reserveRecallCheckout(token, 'u1')).checkoutUrl).toBe(
      'https://checkout.stripe.test/session'
    );
    const events = await state.database!.select().from(schema.funnelEvent);
    expect(events.every((e) => e.eventName === 'recall_clicked')).toBe(true);
  });
  it('concurrent workers claim only one email and uncertain sends cannot be reclaimed', async () => {
    const row = (await issueRecall(candidate()))!;
    const claims = (
      await Promise.all([claimRecallSend(row), claimRecallSend(row)])
    ).filter(Boolean);
    expect(claims).toHaveLength(1);
    await markRecallSend(row.id, claims[0]!);
    expect(await claimRecallSend(row)).toBeNull();
  });
  it('releases a quota rejection so the same row can be claimed again', async () => {
    const row = (await issueRecall(candidate()))!;
    const claim = await claimRecallSend(row);
    expect(claim).toBeTruthy();
    await releaseRecallSend(row.id, claim!);
    const [released] = await state
      .database!.select()
      .from(schema.emailRecall)
      .where(eq(schema.emailRecall.id, row.id));
    expect(released?.status).toBe('ready');
    expect(released?.claimToken).toBeNull();
    const again = await claimRecallSend(row);
    expect(again).toBeTruthy();
    expect(again).not.toBe(claim);
  });
  it('names the Resend quota errors that pause recall until the next UTC day', () => {
    expect(isRecallQuotaError('daily_quota_exceeded')).toBe(true);
    expect(isRecallQuotaError('monthly_quota_exceeded')).toBe(true);
    expect(isRecallQuotaError('rate_limit_exceeded')).toBe(false);
    expect(
      isRecallQuotaError(
        'application_error',
        'You have exceeded your daily email sending quota.'
      )
    ).toBe(true);
    expect(
      isRecallQuotaError(
        'rate_limit_exceeded',
        'Too many requests. Please limit the number of requests per second.'
      )
    ).toBe(false);
    expect(recallQuotaPauseUntil(Date.parse('2026-10-16T18:00:00.000Z'))).toBe(
      '2026-10-17T00:00:00.000Z'
    );
    expect(recallQuotaPauseUntil(Date.parse('2026-10-17T00:00:00.000Z'))).toBe(
      '2026-10-18T00:00:00.000Z'
    );
  });
  it('reports recall orders separately from site and test orders', async () => {
    const row = (await issueRecall(candidate()))!;
    await siteOrder(40, {
      status: 'paid',
      paymentConfirmedAt: new Date(),
      paymentAmount: 999,
    });
    await state.database!.insert(schema.order).values({
      id: 'recall-order',
      orderNo: 'R1',
      userId: 'u1',
      recallId: row.id,
      checkoutSource: 'email_recall',
      status: 'paid',
      amount: 499,
      paymentAmount: 499,
      paymentConfirmedAt: new Date(),
      currency: 'usd',
      paymentProvider: 'stripe',
      checkoutInfo: '{}',
    });
    expect(await getRecallStats()).toMatchObject({
      checkouts: 1,
      payments: [{ currency: 'usd', people: 1, amount: 499 }],
    });
  });
});

const budgetAt = new Date('2026-10-16T18:00:00.000Z');
const openLimits = { daily: 80, monthly: 2500 };

async function counter(name: string) {
  const [row] = await state
    .database!.select()
    .from(schema.config)
    .where(eq(schema.config.name, name));
  return row?.value ?? null;
}

describe('recall send budget', () => {
  it('lets only one concurrent reservation take the last daily slot', async () => {
    const results = await Promise.all([
      reserveRecallSend({ daily: 1, monthly: 2500 }, budgetAt),
      reserveRecallSend({ daily: 1, monthly: 2500 }, budgetAt),
      reserveRecallSend({ daily: 1, monthly: 2500 }, budgetAt),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await counter(RECALL_DAILY_COUNTER_KEY)).toBe('2026-10-16:1');
    expect(
      await recallSendAllowance({ daily: 1, monthly: 2500 }, budgetAt)
    ).toBe(0);
    expect(await reserveRecallSend({ daily: 1, monthly: 2500 }, budgetAt)).toBe(
      false
    );
  });

  it('counts recall mail already sent in the UTC day and month', async () => {
    const row = (await issueRecall(candidate()))!;
    await state
      .database!.update(schema.emailRecall)
      .set({
        status: 'sent',
        sentAt: new Date('2026-10-15T23:00:00.000Z'),
        resendId: 're_yesterday',
      })
      .where(eq(schema.emailRecall.id, row.id));
    expect(
      await recallSendAllowance({ daily: 1, monthly: 2500 }, budgetAt)
    ).toBe(1);
    expect(await recallSendAllowance({ daily: 80, monthly: 1 }, budgetAt)).toBe(
      0
    );

    await state
      .database!.update(schema.emailRecall)
      .set({ sentAt: new Date('2026-10-16T12:00:00.000Z') })
      .where(eq(schema.emailRecall.id, row.id));
    expect(await reserveRecallSend({ daily: 1, monthly: 2500 }, budgetAt)).toBe(
      false
    );
    expect(await counter(RECALL_DAILY_COUNTER_KEY)).toBe('2026-10-16:1');
    expect(
      await recallSendAllowance({ daily: 1, monthly: 2500 }, budgetAt)
    ).toBe(0);
  });

  it('releases a rejected send and blocks the month without keeping the day', async () => {
    expect(await reserveRecallSend(openLimits, budgetAt)).toBe(true);
    await releaseRecallSendReservation(budgetAt);
    expect(await counter(RECALL_DAILY_COUNTER_KEY)).toBe('2026-10-16:0');
    expect(await counter(RECALL_MONTHLY_COUNTER_KEY)).toBe('2026-10:0');
    await releaseRecallSendReservation(budgetAt);
    expect(await counter(RECALL_DAILY_COUNTER_KEY)).toBe('2026-10-16:0');

    expect(await reserveRecallSend({ daily: 80, monthly: 0 }, budgetAt)).toBe(
      false
    );
    expect(await counter(RECALL_DAILY_COUNTER_KEY)).toBe('2026-10-16:0');
  });

  it('bounds a run to the smaller remaining cap and never above 25', async () => {
    expect(await recallSendAllowance(openLimits, budgetAt)).toBe(25);
    expect(
      await recallSendAllowance({ daily: 3, monthly: 2500 }, budgetAt)
    ).toBe(3);
    expect(await recallSendAllowance({ daily: 80, monthly: 2 }, budgetAt)).toBe(
      2
    );
    expect(
      await recallSendAllowance({ daily: 0, monthly: 2500 }, budgetAt)
    ).toBe(0);
  });
});
