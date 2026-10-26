import { sql, type SQL } from 'drizzle-orm';

import { db } from '@/core/db';

export type CompiledWrite = { sql: string; params: unknown[] };

/** D1 batch is a real transaction; the compatibility transaction callback is not. */
export async function runD1Batch(queries: CompiledWrite[]) {
  const binding = (
    (globalThis as any).__CF_ENV__ ?? (globalThis as any).__env__
  )?.DB;
  if (!binding) throw new Error('Missing D1 binding');
  return binding.batch(
    queries.map((query) => binding.prepare(query.sql).bind(...query.params))
  );
}

/** Abort the entire batch if a balance changed after it was read. No schema needed. */
export function d1BatchGuard(condition: SQL): CompiledWrite {
  // SQLite's integer overflow is deliberate and evaluated only on the failed branch.
  return db()
    .select({
      accepted: sql`case when ${condition} then 1 else abs(-9223372036854775808) end`,
    })
    .from(sql`(select 1)`)
    .limit(1)
    .toSQL();
}

export function isD1GuardConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /integer overflow/i.test(error.message) || isD1GuardConflict(error.cause)
  );
}
