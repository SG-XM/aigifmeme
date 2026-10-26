import { readdirSync, readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fulfillPayment } from '@/core/db/payment-fulfillment';
import {
  abExperiment,
  abParticipant,
  abVisitor,
  credit,
  order,
  subscription,
  user,
} from '@/config/db/schema';
import { handleSubscriptionRenewal } from '@/modules/payment/service';
import { HOME_LOGIN_SCENE, isABMutationAllowed } from '@/lib/ab-tests';

import {
  assignParticipant,
  assignVisitor,
  createExperiment,
  getCheckoutParticipant,
  getExperimentStats,
  getVisitorCheckoutParticipant,
  isExposedSceneVariant,
  recordExposure,
  recordVisitorEvent,
  recordVisitorGeneration,
  summarizeGroups,
  transitionExperiment,
} from './service';

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock('@/core/db', () => ({ db: () => state.database }));
vi.mock('@/config', () => ({ envConfigs: { database_provider: 'd1' } }));

let client: ReturnType<typeof createClient>;
const days = 86400000;
const now = Date.now();
const asDate = (offset: number) => new Date(now + offset * days);

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  state.database = drizzle(client);
  // Recreate the prior schema, then run the exact production migration.
  const snapshot = JSON.parse(
    readFileSync('drizzle/meta/0000_snapshot.json', 'utf8')
  );
  for (const table of Object.values(snapshot.tables) as any[]) {
    const columns = Object.values(table.columns).map(
      (c: any) =>
        `"${c.name}" ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.default !== undefined ? ` DEFAULT ${c.default}` : ''}`
    );
    await client.execute(
      `CREATE TABLE "${table.name}" (${columns.join(', ')})`
    );
    for (const index of Object.values(table.indexes) as any[]) {
      await client.execute(
        `CREATE ${index.isUnique ? 'UNIQUE ' : ''}INDEX "${index.name}" ON "${table.name}" (${index.columns.map((c: string) => `"${c}"`).join(', ')})`
      );
    }
  }
  // Apply the complete migration chain so attribution tests use the current schema.
  for (const file of readdirSync('drizzle')
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.startsWith('0000_'))
    .sort()) {
    await client.executeMultiple(readFileSync('drizzle/' + file, 'utf8'));
  }
  await state.database.insert(user).values([
    { id: 'u1', name: 'One', email: 'one@example.test' },
    { id: 'u2', name: 'Two', email: 'two@example.test' },
  ]);
  // Exercise the real D1 compiled statements against SQLite's atomic batch.
  (globalThis as any).__CF_ENV__ = {
    DB: {
      prepare: (sql: string) => ({ bind: (...args: any[]) => ({ sql, args }) }),
      batch: (statements: any[]) => client.batch(statements, 'write'),
    },
  };
});

describe('anonymous home login experiment', () => {
  it('attributes EUR purchases to the original visitor group without dropping anonymous abandonments', async () => {
    const id = await running(HOME_LOGIN_SCENE);
    const visitor = (await assignVisitor('paying-browser'))!;
    const abandoned = (await assignVisitor('abandoned-browser'))!;
    await recordVisitorEvent(
      'paying-browser',
      visitor.participantId,
      'exposure'
    );
    await recordVisitorEvent(
      'abandoned-browser',
      abandoned.participantId,
      'exposure'
    );
    const linked = (await assignVisitor('paying-browser', 'u1'))!;
    await checkout('visitor-eur-order', linked.checkoutParticipantId, {
      status: 'paid',
      paymentConfirmedAt: new Date(),
      paidAt: new Date(),
      paymentAmount: 1000,
      paymentCurrency: 'eur',
    });
    const report = await getExperimentStats(id);
    const paidGroup = report.groups.find(
      (group) => group.variant === visitor.variant
    )!;
    expect(paidGroup.payers).toBe(1);
    expect(paidGroup.revenue[0]).toMatchObject({
      currency: 'EUR',
      amount: 1000,
    });
    expect(
      report.groups.reduce((total, group) => total + group.participants, 0)
    ).toBe(2);
  });
  it('recruits anonymous visitors, keeps sticky groups and excludes existing signed-in users', async () => {
    await running(HOME_LOGIN_SCENE);
    expect(await assignVisitor('signed-in-browser', 'u1')).toBeNull();
    const assignments = await Promise.all(
      Array.from({ length: 6 }, () => assignVisitor('browser-1'))
    );
    expect(new Set(assignments.map((p) => p!.participantId)).size).toBe(1);
    expect(new Set(assignments.map((p) => p!.variant)).size).toBe(1);
    expect(await state.database.select().from(abVisitor)).toHaveLength(1);
  });
  it('rejects another cookie, records first events only, binds login and verifies payment ownership', async () => {
    await running(HOME_LOGIN_SCENE);
    const assignment = (await assignVisitor('browser-1'))!;
    await expect(
      recordVisitorEvent('browser-2', assignment.participantId, 'exposure')
    ).rejects.toThrow();
    await recordVisitorEvent(
      'browser-1',
      assignment.participantId,
      'photo_selected'
    );
    expect(
      (await state.database.select().from(abVisitor))[0].photoSelectedAt
    ).toBeNull();
    await recordVisitorEvent('browser-1', assignment.participantId, 'exposure');
    await recordVisitorEvent(
      'browser-1',
      assignment.participantId,
      'photo_selected'
    );
    const first = (await state.database.select().from(abVisitor))[0];
    await recordVisitorEvent('browser-1', assignment.participantId, 'exposure');
    expect(
      (await state.database.select().from(abVisitor))[0].firstExposedAt
    ).toEqual(first.firstExposedAt);
    const signedIn = (await assignVisitor('browser-1', 'u1'))!;
    expect(signedIn.variant).toBe(assignment.variant);
    expect(signedIn.checkoutParticipantId).toBeTruthy();
    expect(
      await getVisitorCheckoutParticipant('browser-1', 'u1', 'subscription')
    ).toBe(signedIn.checkoutParticipantId);
    expect(
      await getVisitorCheckoutParticipant('browser-1', 'u2', 'subscription')
    ).toBeNull();
    expect(
      await getVisitorCheckoutParticipant('browser-1', 'u1', 'topup')
    ).toBeNull();
    expect((await assignVisitor('browser-1'))!.variant).toBe(
      assignment.variant
    );
  });
  it('includes pre-login abandonments in the funnel denominator and attributes verified generation', async () => {
    const id = await running(HOME_LOGIN_SCENE);
    const first = (await assignVisitor('browser-1'))!;
    const second = (await assignVisitor('browser-2'))!;
    await recordVisitorEvent('browser-1', first.participantId, 'exposure');
    await recordVisitorEvent('browser-2', second.participantId, 'exposure');
    await recordVisitorEvent('browser-1', first.participantId, 'submit');
    await recordVisitorGeneration('browser-1', 'u1');
    await recordVisitorGeneration('browser-2', 'u2');
    const report = await getExperimentStats(id);
    expect(
      report.groups.reduce((total, group) => total + group.participants, 0)
    ).toBe(2);
    expect(
      report.groups.reduce(
        (total, group) => total + group.visitorFunnel!.authenticated,
        0
      )
    ).toBe(2);
    expect(
      report.groups.reduce(
        (total, group) => total + group.visitorFunnel!.generations,
        0
      )
    ).toBe(2);
    // Add a third exposed visitor who never signs in.
    const abandoned = (await assignVisitor('browser-3'))!;
    await recordVisitorEvent('browser-3', abandoned.participantId, 'exposure');
    const final = await getExperimentStats(id);
    expect(
      final.groups.reduce((total, group) => total + group.participants, 0)
    ).toBe(3);
    expect(
      final.groups.reduce(
        (total, group) => total + group.visitorFunnel!.authenticated,
        0
      )
    ).toBe(2);
  });
  it('stops recruiting while allowing exposed visitors to finish within their window', async () => {
    const id = await running(HOME_LOGIN_SCENE);
    const p = (await assignVisitor('browser-1'))!;
    await recordVisitorEvent('browser-1', p.participantId, 'exposure');
    await transitionExperiment(id, 'stop');
    expect(await assignVisitor('new-browser')).toBeNull();
    expect((await assignVisitor('browser-1', 'u1'))!.variant).toBe(p.variant);
    await state.database
      .update(abVisitor)
      .set({ firstExposedAt: asDate(-8), generatedAt: null })
      .where(eq(abVisitor.id, p.participantId));
    await recordVisitorGeneration('browser-1', 'u1');
    expect(
      (await state.database.select().from(abVisitor))[0].generatedAt
    ).toBeNull();
  });
});
afterEach(() => {
  client.close();
  delete (globalThis as any).__CF_ENV__;
});

async function running(scene = 'pricing') {
  const { id } = await createExperiment({
    key: `test-${scene}`,
    name: 'Test',
    scene,
    productScope: 'subscription',
    bPercent: 50,
    windowDays: 7,
  });
  await transitionExperiment(id, 'start');
  return id;
}
async function checkout(
  id: string,
  participantId: string | null = null,
  extra: Record<string, unknown> = {}
) {
  await state.database.insert(order).values({
    id,
    orderNo: `ORD-${id}`,
    userId: 'u1',
    status: 'created',
    amount: 1000,
    currency: 'usd',
    paymentProvider: 'stripe',
    checkoutInfo: '{}',
    abParticipantId: participantId,
    ...extra,
  });
}

describe('UI A/B lifecycle and attribution', () => {
  it('keeps a single sticky assignment during concurrent requests', async () => {
    await running();
    const assigned = await Promise.all(
      Array.from({ length: 8 }, () => assignParticipant('pricing', 'u1'))
    );
    expect(new Set(assigned.map((a) => a!.participantId)).size).toBe(1);
    expect(new Set(assigned.map((a) => a!.variant)).size).toBe(1);
    expect(await state.database.select().from(abParticipant)).toHaveLength(1);
  });
  it('uses a unique active scene even when two experiments start concurrently', async () => {
    const input = {
      name: 'Test',
      scene: 'pricing',
      productScope: 'subscription' as const,
      bPercent: 50,
      windowDays: 7,
    };
    const a = await createExperiment({ ...input, key: 'test-one' });
    const b = await createExperiment({ ...input, key: 'test-two' });
    const attempts = await Promise.allSettled([
      transitionExperiment(a.id, 'start'),
      transitionExperiment(b.id, 'start'),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('attributes subscriptions and top-ups when the experiment counts any purchase', async () => {
    const { id } = await createExperiment({
      key: 'paywall-any',
      name: 'Paywall',
      scene: 'paywall-sub-first-v1',
      productScope: 'any',
      bPercent: 50,
      windowDays: 7,
    });
    await transitionExperiment(id, 'start');
    const p = (await assignParticipant('paywall-sub-first-v1', 'u1'))!;
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'subscription')
    ).toBeNull();
    await recordExposure(p.participantId, 'u1');
    expect(await getCheckoutParticipant(p.participantId, 'u1', 'topup')).toBe(
      p.participantId
    );
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'subscription')
    ).toBe(p.participantId);
  });
  it('requires actual exposure and ownership, and does not reset the exposure clock', async () => {
    await running();
    const p = (await assignParticipant('pricing', 'u1'))!;
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'subscription')
    ).toBeNull();
    await expect(recordExposure(p.participantId, 'u2')).rejects.toThrow();
    await recordExposure(p.participantId, 'u1');
    const [before] = await state.database.select().from(abParticipant);
    await recordExposure(p.participantId, 'u1');
    const [after] = await state.database.select().from(abParticipant);
    expect(after.firstExposedAt).toEqual(before.firstExposedAt);
    expect(
      await getCheckoutParticipant(p.participantId, 'u2', 'subscription')
    ).toBeNull();
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'topup')
    ).toBeNull();
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'subscription')
    ).toBe(p.participantId);
  });
  it('stops recruitment but allows attributed purchases in the original window', async () => {
    const id = await running();
    const p = (await assignParticipant('pricing', 'u1'))!;
    await recordExposure(p.participantId, 'u1');
    await transitionExperiment(id, 'stop');
    expect(await assignParticipant('pricing', 'u2')).toBeNull();
    expect(await assignParticipant('pricing', 'u1')).toEqual(p);
    await recordExposure(p.participantId, 'u1');
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'subscription')
    ).toBe(p.participantId);
    await state.database
      .update(abParticipant)
      .set({ firstExposedAt: asDate(-8) })
      .where(eq(abParticipant.id, p.participantId));
    expect(
      await getCheckoutParticipant(p.participantId, 'u1', 'subscription')
    ).toBeNull();
    expect(await assignParticipant('pricing', 'u1')).toBeNull();
    await expect(transitionExperiment(id, 'start')).rejects.toThrow();
  });
  it('gates the retention name-your-price scene to an exposed B participant', async () => {
    const { id } = await createExperiment({
      key: 'retention-name-price-v1-test',
      name: 'Retention name your price',
      scene: 'video-retention-offer-v2',
      productScope: 'topup',
      bPercent: 50,
      windowDays: 7,
    });
    await transitionExperiment(id, 'start');
    const assigned = (await assignParticipant(
      'video-retention-offer-v2',
      'u1'
    ))!;
    await state.database
      .update(abParticipant)
      .set({ variant: 'B' })
      .where(eq(abParticipant.id, assigned.participantId));
    expect(
      await isExposedSceneVariant(
        assigned.participantId,
        'u1',
        'video-retention-offer-v2',
        'B',
        'topup'
      )
    ).toBe(false);
    await recordExposure(assigned.participantId, 'u1');
    expect(
      await isExposedSceneVariant(
        assigned.participantId,
        'u1',
        'video-retention-offer-v2',
        'B',
        'topup'
      )
    ).toBe(true);
    expect(
      await isExposedSceneVariant(
        assigned.participantId,
        'u1',
        'video-retention-offer-v2',
        'A',
        'topup'
      )
    ).toBe(false);
    expect(
      await isExposedSceneVariant(
        assigned.participantId,
        'u2',
        'video-retention-offer-v2',
        'B',
        'topup'
      )
    ).toBe(false);
  });
  it('excludes tests and manual paid states, preserves zero revenue, and separates currency', async () => {
    const id = await running();
    const p = (await assignParticipant('pricing', 'u1'))!;
    await recordExposure(p.participantId, 'u1');
    await state.database
      .update(abParticipant)
      .set({ firstExposedAt: new Date(Date.now() - 1000) })
      .where(eq(abParticipant.id, p.participantId));
    await checkout('real', p.participantId);
    await fulfillPayment(
      'real',
      {
        status: 'paid',
        paymentConfirmedAt: new Date(),
        paymentAmount: 1000,
        paymentCurrency: 'usd',
      },
      []
    );
    await checkout('zero', p.participantId, {
      paymentConfirmedAt: new Date(),
      paymentAmount: 0,
      paymentCurrency: 'usd',
    });
    await checkout('eur', p.participantId, {
      paymentConfirmedAt: new Date(),
      paymentAmount: 500,
      paymentCurrency: 'eur',
    });
    await checkout('test', p.participantId, {
      paymentConfirmedAt: new Date(),
      paymentAmount: 1,
      paymentCurrency: 'usd',
      isTest: true,
    });
    await checkout('manual', p.participantId, {
      status: 'paid',
      paymentAmount: 100000,
      paymentCurrency: 'usd',
    });
    await checkout('missing', p.participantId, {
      paymentConfirmedAt: new Date(),
    });
    await checkout('unattributed', null, {
      paymentConfirmedAt: new Date(),
      paymentAmount: 100000,
      paymentCurrency: 'usd',
    });
    const report = await getExperimentStats(id);
    const g = report.groups.find((g) => g.variant === p.variant)!;
    expect(g).toMatchObject({
      participants: 1,
      payers: 1,
      paidOrders: 4,
      conversionRate: 1,
      missingAmounts: 1,
    });
    expect(g.revenue).toEqual(
      expect.arrayContaining([
        { currency: 'USD', amount: 1000, perUser: 1000, averageOrder: 500 },
        { currency: 'EUR', amount: 500, perUser: 500, averageOrder: 500 },
      ])
    );
  });
  it('uses fixed exposure windows and reports mature conversion separately', () => {
    const participants = [
      { id: 'old', variant: 'A', firstExposedAt: asDate(-10) },
      { id: 'new', variant: 'A', firstExposedAt: asDate(-1) },
      { id: 'unseen', variant: 'B', firstExposedAt: null },
    ] as any;
    const orders = [
      {
        abParticipantId: 'old',
        createdAt: asDate(-9),
        paymentConfirmedAt: asDate(-9),
        paymentAmount: 100,
        paymentCurrency: 'usd',
      },
      {
        abParticipantId: 'old',
        createdAt: asDate(-9),
        paymentConfirmedAt: asDate(-2),
        paymentAmount: 10000,
        paymentCurrency: 'usd',
      },
      {
        abParticipantId: 'new',
        createdAt: asDate(-0.5),
        paymentConfirmedAt: null,
      },
    ] as any;
    const [a, b] = summarizeGroups(
      { windowDays: 7 },
      participants,
      orders,
      now
    );
    expect(a).toMatchObject({
      participants: 2,
      payers: 1,
      matureParticipants: 1,
      maturePayers: 1,
      conversionRate: 0.5,
      matureConversionRate: 1,
    });
    expect(a.revenue[0].amount).toBe(100);
    expect(b.participants).toBe(0);
    expect(b.matureConversionRate).toBeNull();
  });
  it('uses verified paidAt rather than late webhook arrival to attribute revenue', () => {
    const participants = [
      { id: 'old', variant: 'A', firstExposedAt: asDate(-10) },
    ] as any;
    const orders = [
      {
        abParticipantId: 'old',
        createdAt: asDate(-9),
        paidAt: asDate(-9),
        paymentConfirmedAt: asDate(-1),
        paymentAmount: 100,
        paymentCurrency: 'usd',
      },
    ] as any;
    const [a] = summarizeGroups({ windowDays: 7 }, participants, orders, now);
    expect(a.payers).toBe(1);
    expect(a.revenue[0].amount).toBe(100);
  });
});

describe('D1 payment confirmation', () => {
  const grant = (id: string) => ({
    table: credit,
    values: {
      id,
      userId: 'u1',
      transactionNo: id,
      transactionType: 'grant',
      credits: 10,
      remainingCredits: 10,
      status: 'active',
    },
  });
  it('grants only once when multiple callbacks arrive, including a previously failed order', async () => {
    await checkout('retry', null, { status: 'failed' });
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        fulfillPayment(
          'retry',
          { status: 'paid', paymentConfirmedAt: new Date(), paymentAmount: 0 },
          [grant(`credit-${i}`)]
        )
      )
    );
    expect(await state.database.select().from(credit)).toHaveLength(1);
    const [paid] = await state.database.select().from(order);
    expect(paid.paymentConfirmedAt).toBeInstanceOf(Date);
    expect(paid.paymentAmount).toBe(0);
  });
  it('rolls back all benefits when a later statement fails', async () => {
    await checkout('rollback');
    await expect(
      fulfillPayment(
        'rollback',
        { status: 'paid', paymentConfirmedAt: new Date() },
        [grant('duplicate'), grant('duplicate')]
      )
    ).rejects.toThrow();
    expect(await state.database.select().from(credit)).toHaveLength(0);
    const [pending] = await state.database.select().from(order);
    expect(pending.status).toBe('created');
    expect(pending.paymentConfirmedAt).toBeNull();
  });
  it('atomically creates the subscription and credit grant only once', async () => {
    await checkout('sub-order');
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        fulfillPayment(
          'sub-order',
          {
            status: 'paid',
            paymentConfirmedAt: new Date(),
            subscriptionNo: `sub-${i}`,
          },
          [
            {
              table: subscription,
              values: {
                id: `sub-${i}`,
                subscriptionNo: `sub-${i}`,
                userId: 'u1',
                status: 'active',
                paymentProvider: 'stripe',
                subscriptionId: 'provider-sub',
                subscriptionResult: '{}',
              },
            },
            grant(`sub-credit-${i}`),
          ]
        )
      )
    );
    expect(await state.database.select().from(subscription)).toHaveLength(1);
    expect(await state.database.select().from(credit)).toHaveLength(1);
    const [paid] = await state.database.select().from(order);
    const [sub] = await state.database.select().from(subscription);
    expect(paid.subscriptionNo).toBe(sub.subscriptionNo);
  });
});

describe('mutation origin protection', () => {
  it('rejects cross-origin/cross-site mutations and permits same-origin clients', () => {
    expect(
      isABMutationAllowed(
        new Request('https://app.test/api', {
          headers: { origin: 'https://evil.test' },
        })
      )
    ).toBe(false);
    expect(
      isABMutationAllowed(
        new Request('https://app.test/api', {
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      )
    ).toBe(false);
    expect(
      isABMutationAllowed(
        new Request('https://app.test/api', {
          headers: { origin: 'https://app.test' },
        })
      )
    ).toBe(true);
  });
});

describe('D1 subscription renewal', () => {
  async function renewalFixture() {
    await state.database.insert(subscription).values({
      id: 'renew-sub',
      subscriptionNo: 'renew-sub',
      userId: 'u1',
      status: 'active',
      paymentProvider: 'stripe',
      subscriptionId: 'provider-renew',
      amount: 60000,
      currency: 'usd',
      interval: 'year',
      creditsAmount: 6000,
      creditsValidDays: 365,
      currentPeriodEnd: new Date('2026-01-01'),
    });
    return {
      subscriptionId: 'provider-renew',
      paymentStatus: 'paid',
      subscriptionInfo: {
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2027-01-01'),
      },
      paymentInfo: {
        transactionId: 'renew-txn',
        paymentAmount: 60000,
        paymentCurrency: 'usd',
      },
      paymentResult: {},
    };
  }
  it('grants the annual allowance once when duplicate renewal callbacks race', async () => {
    const session = await renewalFixture();
    await Promise.all([
      handleSubscriptionRenewal(session, 'stripe'),
      handleSubscriptionRenewal(session, 'stripe'),
    ]);
    const grants = await state.database.select().from(credit);
    expect(grants).toHaveLength(1);
    expect(grants[0].credits).toBe(6000);
    expect(grants[0].expiresAt).toEqual(new Date('2027-01-01'));
    expect(await state.database.select().from(order)).toHaveLength(1);
  });
  it('grants when a subscription update announced the new period before payment', async () => {
    const session = await renewalFixture();
    await state.database
      .update(subscription)
      .set({ currentPeriodEnd: session.subscriptionInfo.currentPeriodEnd })
      .where(eq(subscription.id, 'renew-sub'));
    await handleSubscriptionRenewal(session, 'stripe');
    expect(await state.database.select().from(credit)).toHaveLength(1);
  });
  it('rolls back subscription period and renewal order when granting fails', async () => {
    const session = await renewalFixture();
    await client.execute(
      "CREATE TRIGGER reject_grant BEFORE INSERT ON credit BEGIN SELECT RAISE(ABORT, 'test grant failure'); END"
    );
    await expect(
      handleSubscriptionRenewal(session, 'stripe')
    ).rejects.toThrow();
    const [sub] = await state.database.select().from(subscription);
    expect(sub.currentPeriodEnd).toEqual(new Date('2026-01-01'));
    expect(await state.database.select().from(order)).toHaveLength(0);
  });
});
