import { and, eq, getTableName, inArray, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { order } from '@/config/db/schema';

type Insert = {
  table: Parameters<typeof getTableName>[0];
  values: Record<string, unknown>;
};
type CompiledQuery = { sql: string; params: unknown[] };

/** Add a bound guard to a single-row insert compiled by Drizzle's SQLite dialect. */
export function guardedD1Insert(
  query: CompiledQuery,
  orderId: string
): CompiledQuery {
  const match = /^(.*) values \(([\s\S]*)\)$/.exec(query.sql);
  if (!match) throw new Error('Unsupported payment insert');
  return {
    sql: `${match[1]} select ${match[2]} where exists (select 1 from "order" where "id" = ? and "payment_confirmed_at" is null and "status" in ('created', 'pending', 'failed'))`,
    params: [...query.params, orderId],
  };
}

/** Confirm initial orders and grant benefits exactly once, including D1. */
export async function fulfillPayment(
  orderId: string,
  update: Record<string, unknown>,
  inserts: Insert[]
) {
  const database = db();
  const guard = and(
    eq(order.id, orderId),
    isNull(order.paymentConfirmedAt),
    inArray(order.status, ['created', 'pending', 'failed'])
  );
  if (envConfigs.database_provider === 'd1') {
    // D1's compatibility transaction() is a no-op. A native batch is atomic.
    // Every insert checks the same unconfirmed order; the final statement claims it.
    const statements = inserts.map((insert) =>
      guardedD1Insert(
        database.insert(insert.table).values(insert.values).toSQL(),
        orderId
      )
    );
    statements.push(database.update(order).set(update).where(guard).toSQL());
    const binding = (
      (globalThis as any).__CF_ENV__ ?? (globalThis as any).__env__
    )?.DB;
    if (!binding) throw new Error('Missing D1 binding');
    await binding.batch(
      statements.map((q) => binding.prepare(q.sql).bind(...q.params))
    );
    return;
  }
  await database.transaction(async (tx: any) => {
    // Real SQL transactions lock on PG/MySQL; SQLite serializes writers.
    const [current] = await tx
      .select()
      .from(order)
      .where(eq(order.id, orderId))
      .for('update')
      .limit(1);
    if (
      !current ||
      !['created', 'pending', 'failed'].includes(current.status) ||
      current.paymentConfirmedAt
    )
      return;
    for (const insert of inserts)
      await tx.insert(insert.table).values(insert.values);
    await tx.update(order).set(update).where(guard);
  });
}
