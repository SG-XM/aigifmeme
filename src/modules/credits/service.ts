import { and, asc, desc, eq, gt, isNull, or, sql, sum } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  d1BatchGuard,
  isD1GuardConflict,
  runD1Batch,
  type CompiledWrite,
} from '@/core/db/atomic-batch';
import { envConfigs } from '@/config';
import { config, credit } from '@/config/db/schema';
import { getSnowId, getUuid } from '@/lib/hash';
import {
  VIDEO_PRICING_VERSION,
  VIDEO_PRICING_VERSION_KEY,
} from '@/lib/video-pricing';

// --- Enums ---

export enum CreditStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DELETED = 'deleted',
}

export enum CreditTransactionType {
  GRANT = 'grant',
  CONSUME = 'consume',
}

export enum CreditTransactionScene {
  PAYMENT = 'payment',
  SUBSCRIPTION = 'subscription',
  RENEWAL = 'renewal',
  GIFT = 'gift',
  REWARD = 'reward',
}

type NewCredit = typeof credit.$inferInsert;

/** Read directly: a cached admin config must never hide a billing cutover. */
export async function requireCurrentCreditPricing() {
  const [row] = await db()
    .select({ value: config.value })
    .from(config)
    .where(eq(config.name, VIDEO_PRICING_VERSION_KEY))
    .limit(1);
  if (row?.value !== VIDEO_PRICING_VERSION)
    throw new Error(
      'Credit pricing migration is required before checkout or generation'
    );
}

// --- Expiration ---

export function calculateCreditExpirationTime(params: {
  creditsValidDays: number;
  currentPeriodEnd?: Date;
}): Date | null {
  const { creditsValidDays, currentPeriodEnd } = params;

  if (!creditsValidDays || creditsValidDays <= 0) {
    return null; // never expires
  }

  if (currentPeriodEnd) {
    return new Date(currentPeriodEnd.getTime());
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + creditsValidDays);
  return expiresAt;
}

function validCreditConditions(userId: string) {
  const now = new Date();
  return and(
    eq(credit.userId, userId),
    eq(credit.transactionType, CreditTransactionType.GRANT),
    eq(credit.status, CreditStatus.ACTIVE),
    gt(credit.remainingCredits, 0),
    or(isNull(credit.expiresAt), gt(credit.expiresAt, now))
  );
}

// --- Balance ---

export async function getBalance(userId: string): Promise<number> {
  const [result] = await db()
    .select({ total: sum(credit.remainingCredits) })
    .from(credit)
    .where(validCreditConditions(userId));

  return parseInt(result?.total || '0');
}

// --- Grant ---

export async function grant(params: {
  userId: string;
  userEmail?: string;
  credits: number;
  description?: string;
  orderNo?: string;
  subscriptionNo?: string;
  scene?: string;
  expiresAt?: Date | null;
}) {
  if (!Number.isSafeInteger(params.credits) || params.credits < 1)
    throw new Error('Credits must be a positive integer');
  const newCredit: NewCredit = {
    id: getUuid(),
    userId: params.userId,
    userEmail: params.userEmail || '',
    transactionNo: getSnowId(),
    transactionType: CreditTransactionType.GRANT,
    transactionScene: params.scene || CreditTransactionScene.GIFT,
    credits: params.credits,
    remainingCredits: params.credits,
    status: CreditStatus.ACTIVE,
    description: params.description || 'Grant credit',
    orderNo: params.orderNo || '',
    subscriptionNo: params.subscriptionNo || '',
    expiresAt: params.expiresAt !== undefined ? params.expiresAt : null,
  };

  await db().insert(credit).values(newCredit);
  return newCredit;
}

// --- Consume (FIFO with batching) ---

export async function consume(params: {
  userId: string;
  userEmail?: string;
  credits: number;
  scene?: string;
  description?: string;
  metadata?: string;
  tx?: any;
  d1AdditionalWrites?: (creditId: string) => CompiledWrite[];
}): Promise<{ success: boolean; consumedCredit?: any }> {
  const {
    userId,
    userEmail,
    credits: amount,
    scene,
    description,
    metadata,
    tx,
  } = params;
  if (!Number.isSafeInteger(amount) || amount < 1)
    throw new Error('Credits must be a positive integer');
  if (envConfigs.database_provider === 'd1') return consumeD1(params);
  const now = new Date();

  const execute = async (tx: any) => {
    // 1. Check balance
    const [balance] = await tx
      .select({ total: sum(credit.remainingCredits) })
      .from(credit)
      .where(
        and(
          eq(credit.userId, userId),
          eq(credit.transactionType, CreditTransactionType.GRANT),
          eq(credit.status, CreditStatus.ACTIVE),
          gt(credit.remainingCredits, 0),
          or(isNull(credit.expiresAt), gt(credit.expiresAt, now))
        )
      );

    if (!balance?.total || parseInt(balance.total) < amount) {
      return { success: false };
    }

    // 2. FIFO consumption with batching
    let remainingToConsume = amount;
    const batchSize = 1000;
    const maxBatches = 10;
    let batchNo = 0;
    const consumedItems: any[] = [];

    while (remainingToConsume > 0 && batchNo < maxBatches) {
      const batchCredits = await tx
        .select()
        .from(credit)
        .where(
          and(
            eq(credit.userId, userId),
            eq(credit.transactionType, CreditTransactionType.GRANT),
            eq(credit.status, CreditStatus.ACTIVE),
            gt(credit.remainingCredits, 0),
            or(isNull(credit.expiresAt), gt(credit.expiresAt, now))
          )
        )
        .orderBy(
          sql`case when ${credit.expiresAt} is null then 1 else 0 end`,
          asc(credit.expiresAt),
          asc(credit.createdAt),
          asc(credit.id)
        )
        .limit(batchSize)
        .for('update');

      if (!batchCredits || batchCredits.length === 0) break;

      for (const item of batchCredits) {
        if (remainingToConsume <= 0) break;
        const toConsume = Math.min(remainingToConsume, item.remainingCredits);

        await tx
          .update(credit)
          .set({ remainingCredits: item.remainingCredits - toConsume })
          .where(eq(credit.id, item.id));

        consumedItems.push({
          creditId: item.id,
          transactionNo: item.transactionNo,
          creditsConsumed: toConsume,
          creditsBefore: item.remainingCredits,
          creditsAfter: item.remainingCredits - toConsume,
        });

        remainingToConsume -= toConsume;
      }

      batchNo++;
    }

    if (remainingToConsume > 0)
      throw new Error('Credit consumption could not be completed');

    // 3. Create consumption record
    const consumedCredit: NewCredit = {
      id: getUuid(),
      userId,
      userEmail: userEmail || '',
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.CONSUME,
      transactionScene: scene || '',
      status: CreditStatus.ACTIVE,
      description: description || '',
      credits: -amount,
      remainingCredits: 0,
      consumedDetail: JSON.stringify(consumedItems),
      metadata: metadata || '',
    };
    await tx.insert(credit).values(consumedCredit);

    return { success: true, consumedCredit };
  };

  if (tx) return execute(tx);
  return db().transaction(execute);
}

/** Optimistic balance checks and all writes commit in one native D1 batch. */
async function consumeD1(params: Parameters<typeof consume>[0]) {
  const database = db();
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date();
    const rows: Array<typeof credit.$inferSelect> = await database
      .select()
      .from(credit)
      .where(validCreditConditions(params.userId))
      .orderBy(
        sql`case when ${credit.expiresAt} is null then 1 else 0 end`,
        asc(credit.expiresAt),
        asc(credit.createdAt),
        asc(credit.id)
      )
      .limit(10000);
    let remaining = params.credits;
    const items = [];
    const writes: CompiledWrite[] = [];
    for (const row of rows) {
      if (remaining === 0) break;
      const amount = Math.min(remaining, row.remainingCredits);
      writes.push(
        database
          .update(credit)
          .set({ remainingCredits: row.remainingCredits - amount })
          .where(eq(credit.id, row.id))
          .toSQL()
      );
      items.push({
        creditId: row.id,
        transactionNo: row.transactionNo,
        creditsConsumed: amount,
        creditsBefore: row.remainingCredits,
        creditsAfter: row.remainingCredits - amount,
      });
      remaining -= amount;
    }
    if (remaining > 0) return { success: false };
    const consumedCredit: NewCredit = {
      id: getUuid(),
      userId: params.userId,
      userEmail: params.userEmail || '',
      transactionNo: getSnowId(),
      transactionType: CreditTransactionType.CONSUME,
      transactionScene: params.scene || '',
      status: CreditStatus.ACTIVE,
      description: params.description || '',
      credits: -params.credits,
      remainingCredits: 0,
      consumedDetail: JSON.stringify(items),
      metadata: params.metadata || '',
    };
    writes.push(database.insert(credit).values(consumedCredit).toSQL());
    writes.push(...(params.d1AdditionalWrites?.(consumedCredit.id!) ?? []));
    try {
      // Bind the expected grants as one JSON parameter: D1 allows only 100
      // bound parameters per statement, even when a render spans many grants.
      const expected = JSON.stringify(
        items.map((item) => ({
          id: item.creditId,
          remaining: item.creditsBefore,
        }))
      );
      const guard = sql`not exists (
        select 1 from json_each(${expected}) as snapshot
        left join ${credit} on ${credit.id} = json_extract(snapshot.value, '$.id')
        where ${credit.id} is null or ${credit.userId} != ${params.userId}
          or ${credit.transactionType} != 'grant' or ${credit.status} != 'active'
          or ${credit.remainingCredits} != json_extract(snapshot.value, '$.remaining')
          or (${credit.expiresAt} is not null and ${credit.expiresAt} <= ${now.getTime()})
      )`;
      await runD1Batch([d1BatchGuard(guard), ...writes]);
      return { success: true, consumedCredit };
    } catch (error) {
      if (!isD1GuardConflict(error)) throw error;
    }
  }
  throw new Error('Credit balance changed repeatedly; retry generation');
}

async function revokeD1(consumeCreditId: string) {
  const database = db();
  const [record] = await database
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.id, consumeCreditId),
        eq(credit.transactionType, 'consume'),
        eq(credit.status, 'active')
      )
    )
    .limit(1);
  if (!record?.consumedDetail) return;
  const items = JSON.parse(record.consumedDetail) as Array<{
    creditId: string;
    creditsConsumed: number;
  }>;
  const writes = items.map((item) =>
    database
      .update(credit)
      .set({
        remainingCredits: sql`${credit.remainingCredits} + ${item.creditsConsumed}`,
      })
      .where(eq(credit.id, item.creditId))
      .toSQL()
  );
  writes.push(
    database
      .update(credit)
      .set({ status: CreditStatus.DELETED })
      .where(eq(credit.id, record.id))
      .toSQL()
  );
  try {
    await runD1Batch([
      d1BatchGuard(
        sql`exists (select 1 from ${credit} where ${credit.id} = ${record.id} and ${credit.status} = 'active')`
      ),
      ...writes,
    ]);
  } catch (error) {
    if (!isD1GuardConflict(error)) throw error;
    // Another refund already committed; its grant restoration committed in the same batch.
  }
}

// --- Revoke (restore credits from a consumed record) ---

export async function revoke(consumeCreditId: string) {
  if (envConfigs.database_provider === 'd1') return revokeD1(consumeCreditId);
  await db().transaction(async (tx: any) => {
    const [consumeRecord] = await tx
      .select()
      .from(credit)
      .where(
        and(
          eq(credit.id, consumeCreditId),
          eq(credit.transactionType, CreditTransactionType.CONSUME),
          eq(credit.status, CreditStatus.ACTIVE)
        )
      )
      .limit(1);

    if (!consumeRecord?.consumedDetail) return;

    // Claim the reversal before restoring any grants. Only one concurrent
    // failure/cancel request can change ACTIVE → DELETED, so credits cannot be
    // returned twice even when terminal task updates race.
    const claimResult = await tx
      .update(credit)
      .set({ status: CreditStatus.DELETED })
      .where(
        and(
          eq(credit.id, consumeCreditId),
          eq(credit.transactionType, CreditTransactionType.CONSUME),
          eq(credit.status, CreditStatus.ACTIVE)
        )
      );
    if (affectedRows(claimResult) !== 1) return;

    const items = JSON.parse(consumeRecord.consumedDetail);
    // Atomic increment per source grant — no read-modify-write race.
    for (const item of items) {
      await tx
        .update(credit)
        .set({
          remainingCredits: sql`${credit.remainingCredits} + ${item.creditsConsumed}`,
        })
        .where(eq(credit.id, item.creditId));
    }
  });
}

/** Normalize update counts from libsql/D1, postgres.js, and mysql2. */
function affectedRows(result: any): number {
  const candidates = [
    result?.rowsAffected,
    result?.rowCount,
    result?.affectedRows,
    result?.count,
    result?.meta?.changes,
    result?.[0]?.affectedRows,
    result?.[0]?.rowCount,
  ];
  const value = candidates.find((candidate) =>
    Number.isFinite(Number(candidate))
  );
  return value === undefined ? 0 : Number(value);
}

// --- Auto-grant for new user ---

export async function grantForNewUser(params: {
  userId: string;
  userEmail?: string;
  configs: Record<string, string>;
}) {
  const { userId, userEmail, configs } = params;

  if (configs.initial_credits_enabled !== 'true') return;

  const credits = parseInt(configs.initial_credits_amount) || 0;
  if (credits <= 0) return;

  const validDays = parseInt(configs.initial_credits_valid_days) || 0;
  const description = configs.initial_credits_description || 'Initial credits';

  const expiresAt = calculateCreditExpirationTime({
    creditsValidDays: validDays,
  });

  return grant({
    userId,
    userEmail,
    credits,
    description,
    scene: CreditTransactionScene.GIFT,
    expiresAt,
  });
}

// --- History ---

export async function getHistory(userId: string, limit = 50) {
  return db()
    .select()
    .from(credit)
    .where(and(eq(credit.userId, userId), isNull(credit.deletedAt)))
    .orderBy(desc(credit.createdAt))
    .limit(limit);
}
