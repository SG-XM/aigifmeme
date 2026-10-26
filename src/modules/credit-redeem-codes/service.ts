import { and, asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  d1BatchGuard,
  isD1GuardConflict,
  runD1Batch,
} from '@/core/db/atomic-batch';
import { envConfigs } from '@/config';
import { credit, creditRedeemCode, user } from '@/config/db/schema';
import { getSnowId, getUuid } from '@/lib/hash';

const MAX_BATCH_SIZE = 1000;
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const IS_D1 = envConfigs.database_provider === 'd1';

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

function randomCode() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function createBatch(params: {
  count: number;
  credits: number;
  expiresAt: Date;
  note?: string;
  createdBy?: string;
}) {
  if (
    !Number.isSafeInteger(params.count) ||
    params.count < 1 ||
    params.count > MAX_BATCH_SIZE
  ) {
    throw new Error(`Count must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  if (!Number.isSafeInteger(params.credits) || params.credits < 1) {
    throw new Error('Credits must be a positive integer');
  }
  if (!(params.expiresAt instanceof Date) || params.expiresAt <= new Date()) {
    throw new Error('Expiration must be in the future');
  }

  const rows = Array.from({ length: params.count }, () => ({
    id: getUuid(),
    code: randomCode(),
    credits: params.credits,
    note: params.note?.trim() || '',
    expiresAt: params.expiresAt,
    createdBy: params.createdBy || null,
  }));

  // Keep each insert below D1's bound-parameter limit as well as SQLite's.
  for (let offset = 0; offset < rows.length; offset += 15) {
    await db()
      .insert(creditRedeemCode)
      .values(rows.slice(offset, offset + 15));
  }
  return rows;
}

export async function listCodes(params: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}) {
  const now = new Date();
  const conditions = [];
  const search = params.search?.trim();
  if (search) {
    conditions.push(
      or(
        sql`${creditRedeemCode.code} like ${`%${search}%`}`,
        sql`${creditRedeemCode.sentToEmail} like ${`%${search}%`}`,
        sql`${creditRedeemCode.redeemedEmail} like ${`%${search}%`}`,
        sql`${creditRedeemCode.note} like ${`%${search}%`}`
      )!
    );
  }
  if (params.status === 'available') {
    conditions.push(
      and(
        isNull(creditRedeemCode.invalidatedAt),
        isNull(creditRedeemCode.redeemedAt),
        gt(creditRedeemCode.expiresAt, now),
        isNull(creditRedeemCode.sentAt),
        isNull(creditRedeemCode.sendReservedAt)
      )!
    );
  } else if (params.status === 'sent') {
    conditions.push(
      and(
        isNull(creditRedeemCode.invalidatedAt),
        isNull(creditRedeemCode.redeemedAt),
        gt(creditRedeemCode.expiresAt, now),
        sql`${creditRedeemCode.sentAt} is not null`,
        isNull(creditRedeemCode.sendReservedAt)
      )!
    );
  } else if (params.status === 'sending') {
    conditions.push(
      and(
        isNull(creditRedeemCode.invalidatedAt),
        isNull(creditRedeemCode.redeemedAt),
        gt(creditRedeemCode.expiresAt, now),
        isNull(creditRedeemCode.sentAt),
        sql`${creditRedeemCode.sendReservedAt} is not null`
      )!
    );
  } else if (params.status === 'redeemed') {
    conditions.push(sql`${creditRedeemCode.redeemedAt} is not null`);
  } else if (params.status === 'invalidated') {
    conditions.push(sql`${creditRedeemCode.invalidatedAt} is not null`);
  } else if (params.status === 'expired') {
    conditions.push(
      and(
        lt(creditRedeemCode.expiresAt, now),
        isNull(creditRedeemCode.redeemedAt),
        isNull(creditRedeemCode.invalidatedAt)
      )!
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const [total] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(creditRedeemCode)
    .where(where);
  const rows = await db()
    .select()
    .from(creditRedeemCode)
    .where(where)
    .orderBy(desc(creditRedeemCode.createdAt), asc(creditRedeemCode.code))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  return { items: rows, total: Number(total?.total || 0) };
}

export async function invalidateCode(id: string) {
  const now = new Date();
  const result = await db()
    .update(creditRedeemCode)
    .set({ invalidatedAt: now, sendReservedAt: null, sendReservationId: null })
    .where(
      and(
        eq(creditRedeemCode.id, id),
        isNull(creditRedeemCode.invalidatedAt),
        isNull(creditRedeemCode.redeemedAt)
      )
    );
  return result;
}

export async function reserveCodeForEmail(params: {
  credits: number;
  email: string;
}) {
  const now = new Date();
  const staleAt = new Date(now.getTime() - RESERVATION_TTL_MS);
  const reservationId = getUuid();

  if (IS_D1) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const conditions = and(
        eq(creditRedeemCode.credits, params.credits),
        isNull(creditRedeemCode.invalidatedAt),
        isNull(creditRedeemCode.redeemedAt),
        isNull(creditRedeemCode.sentAt),
        gt(creditRedeemCode.expiresAt, now),
        or(
          isNull(creditRedeemCode.sendReservedAt),
          lt(creditRedeemCode.sendReservedAt, staleAt)
        )
      );
      const [row] = await db()
        .select()
        .from(creditRedeemCode)
        .where(conditions)
        .orderBy(asc(creditRedeemCode.createdAt))
        .limit(1);
      if (!row) {
        console.warn('[credit-redeem] reservation found no eligible code', {
          credits: params.credits,
          outcome: 'no-match',
        });
        return null;
      }

      const guard = d1BatchGuard(sql`exists (
        select 1 from ${creditRedeemCode}
        where ${creditRedeemCode.id} = ${row.id}
          and ${creditRedeemCode.invalidatedAt} is null
          and ${creditRedeemCode.redeemedAt} is null
          and ${creditRedeemCode.sentAt} is null
          and ${creditRedeemCode.expiresAt} > ${now.getTime()}
          and (${creditRedeemCode.sendReservedAt} is null or ${creditRedeemCode.sendReservedAt} < ${staleAt.getTime()})
      )`);
      const update = db()
        .update(creditRedeemCode)
        .set({ sendReservedAt: now, sendReservationId: reservationId })
        .where(and(eq(creditRedeemCode.id, row.id), conditions))
        .toSQL();
      try {
        await runD1Batch([guard, update]);
        return { ...row, reservationId, email: params.email };
      } catch (error) {
        if (!isD1GuardConflict(error)) throw error;
      }
    }
    console.warn('[credit-redeem] reservation retries exhausted', {
      credits: params.credits,
      attempts: 3,
      outcome: 'guard-conflict',
    });
    return null;
  }

  return db().transaction(async (tx: any) => {
    const query = tx
      .select()
      .from(creditRedeemCode)
      .where(
        and(
          eq(creditRedeemCode.credits, params.credits),
          isNull(creditRedeemCode.invalidatedAt),
          isNull(creditRedeemCode.redeemedAt),
          isNull(creditRedeemCode.sentAt),
          gt(creditRedeemCode.expiresAt, now),
          or(
            isNull(creditRedeemCode.sendReservedAt),
            lt(creditRedeemCode.sendReservedAt, staleAt)
          )
        )
      )
      .orderBy(asc(creditRedeemCode.createdAt))
      .limit(1);
    const [row] = await (query.for ? query.for('update') : query);
    if (!row) return null;

    await tx
      .update(creditRedeemCode)
      .set({ sendReservedAt: now, sendReservationId: reservationId })
      .where(eq(creditRedeemCode.id, row.id));

    return { ...row, reservationId, email: params.email };
  });
}

export async function finishCodeSend(params: {
  id: string;
  reservationId: string;
  email: string;
}) {
  await db()
    .update(creditRedeemCode)
    .set({
      sentToEmail: params.email,
      sentAt: new Date(),
      sendReservedAt: null,
      sendReservationId: null,
    })
    .where(
      and(
        eq(creditRedeemCode.id, params.id),
        eq(creditRedeemCode.sendReservationId, params.reservationId),
        isNull(creditRedeemCode.invalidatedAt)
      )
    );
  const [row] = await db()
    .select({ id: creditRedeemCode.id })
    .from(creditRedeemCode)
    .where(
      and(
        eq(creditRedeemCode.id, params.id),
        eq(creditRedeemCode.sentToEmail, params.email),
        isNull(creditRedeemCode.sendReservationId),
        isNull(creditRedeemCode.invalidatedAt),
        isNull(creditRedeemCode.redeemedAt)
      )
    )
    .limit(1);
  return !!row;
}

export async function releaseCodeReservation(
  id: string,
  reservationId: string
) {
  await db()
    .update(creditRedeemCode)
    .set({ sendReservedAt: null, sendReservationId: null })
    .where(
      and(
        eq(creditRedeemCode.id, id),
        eq(creditRedeemCode.sendReservationId, reservationId)
      )
    );
}

export async function redeemCode(params: { code: string; email: string }) {
  const normalizedCode = params.code.trim().toUpperCase();
  const normalizedEmail = params.email.trim().toLowerCase();
  const now = new Date();

  if (IS_D1) {
    const [code] = await db()
      .select()
      .from(creditRedeemCode)
      .where(eq(creditRedeemCode.code, normalizedCode))
      .limit(1);
    if (!code) return { status: 'invalid' as const };
    if (code.invalidatedAt) return { status: 'invalidated' as const };
    if (code.redeemedAt) return { status: 'used' as const };
    if (code.expiresAt <= now) return { status: 'expired' as const };

    const [targetUser] = await db()
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .limit(1);
    if (!targetUser) return { status: 'account-not-found' as const };

    const guard = d1BatchGuard(sql`exists (
      select 1 from ${creditRedeemCode}
      where ${creditRedeemCode.id} = ${code.id}
        and ${creditRedeemCode.invalidatedAt} is null
        and ${creditRedeemCode.redeemedAt} is null
        and ${creditRedeemCode.expiresAt} > ${now.getTime()}
    )`);
    const update = db()
      .update(creditRedeemCode)
      .set({
        redeemedAt: now,
        redeemedEmail: normalizedEmail,
        redeemedUserId: targetUser.id,
      })
      .where(
        and(
          eq(creditRedeemCode.id, code.id),
          isNull(creditRedeemCode.invalidatedAt),
          isNull(creditRedeemCode.redeemedAt),
          gt(creditRedeemCode.expiresAt, now)
        )
      )
      .toSQL();
    const grant = db()
      .insert(credit)
      .values({
        id: getUuid(),
        userId: targetUser.id,
        userEmail: targetUser.email,
        transactionNo: getSnowId(),
        transactionType: 'grant',
        transactionScene: 'gift',
        credits: code.credits,
        remainingCredits: code.credits,
        status: 'active',
        description: `Redeem code ${normalizedCode}`,
        orderNo: '',
        subscriptionNo: '',
        expiresAt: null,
      })
      .toSQL();
    try {
      await runD1Batch([guard, update, grant]);
      return { status: 'redeemed' as const, credits: code.credits };
    } catch (error) {
      if (isD1GuardConflict(error)) return { status: 'used' as const };
      throw error;
    }
  }

  return db().transaction(async (tx: any) => {
    const query = tx
      .select()
      .from(creditRedeemCode)
      .where(eq(creditRedeemCode.code, normalizedCode))
      .limit(1);
    const [code] = await (query.for ? query.for('update') : query);
    if (!code) return { status: 'invalid' as const };
    if (code.invalidatedAt) return { status: 'invalidated' as const };
    if (code.redeemedAt) return { status: 'used' as const };
    if (code.expiresAt <= now) return { status: 'expired' as const };

    const [targetUser] = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .limit(1);
    if (!targetUser) return { status: 'account-not-found' as const };

    const claimed = await tx
      .update(creditRedeemCode)
      .set({
        redeemedAt: now,
        redeemedEmail: normalizedEmail,
        redeemedUserId: targetUser.id,
      })
      .where(
        and(
          eq(creditRedeemCode.id, code.id),
          isNull(creditRedeemCode.invalidatedAt),
          isNull(creditRedeemCode.redeemedAt),
          gt(creditRedeemCode.expiresAt, now)
        )
      );
    if (affectedRows(claimed) !== 1) return { status: 'used' as const };

    await tx.insert(credit).values({
      id: getUuid(),
      userId: targetUser.id,
      userEmail: targetUser.email,
      transactionNo: getSnowId(),
      transactionType: 'grant',
      transactionScene: 'gift',
      credits: code.credits,
      remainingCredits: code.credits,
      status: 'active',
      description: `Redeem code ${normalizedCode}`,
      orderNo: '',
      subscriptionNo: '',
      expiresAt: null,
    });

    return { status: 'redeemed' as const, credits: code.credits };
  });
}
