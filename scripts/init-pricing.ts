/**
 * One-command pricing initialization for a FRESH database.
 *
 *   pnpm db:init-pricing            # dry-run: print what would be inserted
 *   pnpm db:init-pricing -- --apply # insert missing catalog rows
 *
 * Seeds the top-up packs + subscription plans from `src/lib/video-pricing.ts`
 * and the hidden retention product (`single_retention_v2`, formerly the
 * standalone seed-video-retention-offer.sql), then sets the
 * `video_credit_pricing_version` gate that checkout/generation require.
 *
 * Idempotent: rows are inserted by productId only when missing and existing
 * rows are never updated, so re-running preserves admin catalog edits and
 * never duplicates. Refuses to run on a database with legacy financial data
 * and no current version gate — that is a cutover, not an init; use
 * `pnpm pricing:update -- --apply` (with its backup + --legacy-ratio flow).
 *
 * DB access follows the existing tooling: scripts/with-env.ts loads
 * .env.{NODE_ENV} (DATABASE_PROVIDER / DATABASE_URL), and `src/core/db`
 * resolves the D1 binding the same way the app does. For remote D1, run it
 * the way README's RBAC seed does — against wrangler's local D1 file, then
 * copy rows up — or point DATABASE_URL at any sqlite/libsql database.
 */
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
import {
  planPricingInit,
  VIDEO_PRICING_VERSION,
} from '../src/lib/pricing-init';
import { VIDEO_PRICING_VERSION_KEY } from '../src/lib/video-pricing';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.some((arg) => arg !== '--apply'))
  throw new Error('Usage: pnpm db:init-pricing [-- --apply]');
const apply = args.includes('--apply');

const database = db();

const [packs, plans, configs, credits, orders, subscriptions, tasks] =
  await Promise.all([
    database
      .select({ productId: creditTopUpProduct.productId })
      .from(creditTopUpProduct),
    database
      .select({ productId: subscriptionPlan.productId })
      .from(subscriptionPlan),
    database.select().from(config),
    database.select({ id: credit.id }).from(credit),
    database.select({ id: order.id }).from(order),
    database.select({ id: subscription.id }).from(subscription),
    database.select({ id: aiTask.id }).from(aiTask),
  ]);

const versionRow = configs.find(
  (row: any) => row.name === VIDEO_PRICING_VERSION_KEY
);
const versionInstalled = versionRow?.value === VIDEO_PRICING_VERSION;
const initialCredits = configs.find(
  (row: any) => row.name === 'initial_credits_amount'
);
const hasLegacyFinancialData =
  credits.length + orders.length + subscriptions.length + tasks.length > 0 ||
  Number(initialCredits?.value ?? 0) > 0;

if (!versionInstalled && hasLegacyFinancialData) {
  throw new Error(
    'Legacy financial data exists but the current pricing version is not installed. ' +
      'This is a pricing cutover, not a fresh init: back up, then run ' +
      '`pnpm pricing:update -- --apply` (add --legacy-ratio after review). No data changed.'
  );
}

const knownIds = new Set(
  planPricingInit([])
    .insertTopUps.map((r) => r.productId)
    .concat(planPricingInit([]).insertPlans.map((r) => r.productId))
);
const unknownExisting = [...packs, ...plans]
  .map((r: any) => r.productId)
  .filter((id: string) => !knownIds.has(id));
if (!versionInstalled && unknownExisting.length > 0) {
  throw new Error(
    `Existing non-current product IDs (${unknownExisting.join(', ')}) without the current ` +
      'pricing version gate. This is a pricing cutover, not a fresh init: back up, then run ' +
      '`pnpm pricing:update -- --apply`. No data changed.'
  );
}

const plan = planPricingInit([
  ...packs.map((r: any) => r.productId),
  ...plans.map((r: any) => r.productId),
]);

console.log(
  JSON.stringify(
    {
      apply,
      pricingVersion: VIDEO_PRICING_VERSION,
      versionGateInstalled: versionInstalled,
      insertTopUps: plan.insertTopUps.map((r) => r.productId),
      insertPlans: plan.insertPlans.map((r) => r.productId),
      existingPreserved: plan.existingProductIds,
    },
    null,
    2
  )
);

if (!apply) {
  console.log('Dry-run only. Re-run with -- --apply to insert the rows above.');
  process.exit(0);
}

await database.transaction(async (tx: any) => {
  for (const row of plan.insertTopUps)
    await tx
      .insert(creditTopUpProduct)
      .values(row)
      .onConflictDoNothing({ target: creditTopUpProduct.productId });
  for (const row of plan.insertPlans)
    await tx
      .insert(subscriptionPlan)
      .values(row)
      .onConflictDoNothing({ target: subscriptionPlan.productId });

  if (versionRow) {
    if (!versionInstalled)
      await tx
        .update(config)
        .set({ value: VIDEO_PRICING_VERSION })
        .where(eq(config.name, VIDEO_PRICING_VERSION_KEY));
  } else {
    await tx
      .insert(config)
      .values({ name: VIDEO_PRICING_VERSION_KEY, value: VIDEO_PRICING_VERSION })
      .onConflictDoNothing({ target: config.name });
  }
});

console.log(
  `Pricing initialized: ${plan.insertTopUps.length} top-up product(s), ` +
    `${plan.insertPlans.length} subscription plan(s) inserted; ` +
    `${plan.existingProductIds.length} existing row(s) preserved. ` +
    `Version gate '${VIDEO_PRICING_VERSION}' is set.`
);
