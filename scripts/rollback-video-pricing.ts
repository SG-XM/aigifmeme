/** Restore a cutover backup only if no writes have happened since migration. */
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';

import {
  aiTask,
  config,
  credit,
  creditTopUpProduct,
  order,
  subscription,
  subscriptionPlan,
} from '../src/config/db/schema';
import { db } from '../src/core/db';
import { VIDEO_PRICING_VERSION } from '../src/lib/video-pricing';

const [path, ...args] = process.argv.slice(2).filter((arg) => arg !== '--');
if (!path || args.some((arg) => arg !== '--apply'))
  throw new Error('Usage: rollback-video-pricing.ts backup.json [--apply]');
const backup = JSON.parse(readFileSync(path, 'utf8'));
if (
  backup.version !== VIDEO_PRICING_VERSION ||
  !backup.snapshot ||
  !backup.expected
)
  throw new Error('Not a completed pricing backup');
const tables = {
  credits: credit,
  orders: order,
  subscriptions: subscription,
  tasks: aiTask,
  packs: creditTopUpProduct,
  plans: subscriptionPlan,
  configs: config,
};
const key = (row: any) => String(row.id ?? row.productId ?? row.name);
const stable = (rows: any[]) =>
  JSON.stringify([...rows].sort((a, b) => key(a).localeCompare(key(b))));

await db().transaction(async (tx: any) => {
  for (const [name, table] of Object.entries(tables)) {
    const rows = await tx.select().from(table);
    if (stable(rows) !== stable(backup.expected[name]))
      throw new Error(
        `New writes detected in ${name}. Automatic rollback refused to preserve new data.`
      );
  }
  if (!args.includes('--apply')) {
    console.log(
      'Rollback checks passed. Pass --apply while all application writers are stopped.'
    );
    return;
  }
  for (const row of backup.snapshot.credits)
    await tx
      .update(credit)
      .set({
        credits: row.credits,
        remainingCredits: row.remainingCredits,
        consumedDetail: row.consumedDetail,
        updatedAt: new Date(row.updatedAt),
      })
      .where(eq(credit.id, row.id));
  for (const row of backup.snapshot.orders)
    await tx
      .update(order)
      .set({
        creditsAmount: row.creditsAmount,
        updatedAt: new Date(row.updatedAt),
      })
      .where(eq(order.id, row.id));
  for (const row of backup.snapshot.subscriptions)
    await tx
      .update(subscription)
      .set({
        creditsAmount: row.creditsAmount,
        updatedAt: new Date(row.updatedAt),
      })
      .where(eq(subscription.id, row.id));
  for (const row of backup.snapshot.tasks)
    await tx
      .update(aiTask)
      .set({ costCredits: row.costCredits, updatedAt: new Date(row.updatedAt) })
      .where(eq(aiTask.id, row.id));
  for (const [name, table] of [
    ['packs', creditTopUpProduct],
    ['plans', subscriptionPlan],
  ] as const) {
    for (const row of backup.expected[name]) {
      if (
        !backup.snapshot[name].some(
          (old: any) => old.productId === row.productId
        )
      )
        await tx.delete(table).where(eq(table.productId, row.productId));
    }
    for (const row of backup.snapshot[name])
      await tx
        .update(table)
        .set({
          enabled: row.enabled,
          credits: row.credits,
          updatedAt: new Date(row.updatedAt),
        })
        .where(eq(table.productId, row.productId));
  }
  for (const row of backup.expected.configs) {
    const old = backup.snapshot.configs.find(
      (candidate: any) => candidate.name === row.name
    );
    if (!old) await tx.delete(config).where(eq(config.name, row.name));
    else if (old.value !== row.value)
      await tx
        .update(config)
        .set({ value: old.value })
        .where(eq(config.name, row.name));
  }
  console.log(
    'Original pricing data restored. Restore the previous code version before restarting writers.'
  );
});
