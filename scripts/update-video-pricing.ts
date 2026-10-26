/** Run with scripts/with-env.ts. Dry-run by default; stop writers before --apply. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  convertLegacyCredits,
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  VIDEO_PRICING_VERSION,
  VIDEO_PRICING_VERSION_KEY,
} from '../src/lib/video-pricing';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--legacy-ratio=')))
  throw new Error(
    'Use --apply and optional --legacy-ratio=numerator/denominator'
  );
const apply = args.includes('--apply');
const ratioArg = args
  .find((arg) => arg.startsWith('--legacy-ratio='))
  ?.split('=')[1];
const ratio = ratioArg?.match(/^([1-9]\d*)\/([1-9]\d*)$/);
if (ratioArg && !ratio)
  throw new Error('Legacy ratio must be numerator/denominator');
const numerator = Number(ratio?.[1] ?? 1);
const denominator = Number(ratio?.[2] ?? 1);
convertLegacyCredits(1, numerator, denominator);

await db().transaction(async (tx: any) => {
  const configs = await tx.select().from(config);
  if (
    configs.some(
      (row: any) =>
        row.name === VIDEO_PRICING_VERSION_KEY &&
        row.value === VIDEO_PRICING_VERSION
    )
  ) {
    console.log(
      'Pricing v2 is already installed; admin catalog edits are preserved.'
    );
    return;
  }
  const snapshot = {
    credits: await tx.select().from(credit),
    orders: await tx.select().from(order),
    subscriptions: await tx.select().from(subscription),
    tasks: await tx.select().from(aiTask),
    packs: await tx.select().from(creditTopUpProduct),
    plans: await tx.select().from(subscriptionPlan),
    configs,
  };
  const initial = configs.find(
    (row: any) => row.name === 'initial_credits_amount'
  );
  const legacy =
    snapshot.credits.length +
      snapshot.orders.length +
      snapshot.subscriptions.length +
      snapshot.tasks.length >
      0 || Number(initial?.value ?? 0) > 0;
  console.log(
    JSON.stringify(
      {
        apply,
        legacy,
        rows: {
          credits: snapshot.credits.length,
          orders: snapshot.orders.length,
          subscriptions: snapshot.subscriptions.length,
          tasks: snapshot.tasks.length,
        },
        ratio: ratioArg ?? null,
        packs: CREDIT_PACKS,
        plans: SUBSCRIPTION_PLANS,
      },
      null,
      2
    )
  );
  if (!apply) return;
  if (legacy && !ratio)
    throw new Error(
      'Legacy financial data exists. Review a backup and pass an explicit --legacy-ratio before applying. No data changed.'
    );
  if (
    snapshot.tasks.some((row: any) =>
      ['pending', 'processing'].includes(row.status)
    )
  ) {
    throw new Error(
      'Wait for pending/processing tasks to finish or cancel them before migrating. No data changed.'
    );
  }

  // Saved before mutation, outside Git, with owner-only filesystem access.
  const backupDir = resolve('data/pricing-backups');
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backup = resolve(backupDir, `pricing-${Date.now()}.json`);
  writeFileSync(
    backup,
    JSON.stringify(
      { version: VIDEO_PRICING_VERSION, ratio: ratioArg, snapshot },
      null,
      2
    ),
    { mode: 0o600, flag: 'wx' }
  );
  console.log(`Backup: ${backup}`);
  const convert = (amount: number) =>
    convertLegacyCredits(amount, numerator, denominator);

  // Dollar prices and provider subscription identities stay as originally sold.
  // Credit snapshots on outstanding orders and existing subscriptions are scaled
  // too, so later callbacks/renewals cannot inject old-unit credits.
  const convertedConsumption = new Map<string, number>();
  for (const row of snapshot.credits) {
    const details = row.consumedDetail
      ? JSON.parse(row.consumedDetail).map((item: any) => ({
          ...item,
          creditsConsumed:
            convert(item.creditsBefore) - convert(item.creditsAfter),
          creditsBefore: convert(item.creditsBefore),
          creditsAfter: convert(item.creditsAfter),
        }))
      : null;
    if (details && row.transactionType === 'consume')
      convertedConsumption.set(
        row.id,
        details.reduce(
          (total: number, item: any) => total + item.creditsConsumed,
          0
        )
      );
    await tx
      .update(credit)
      .set({
        credits:
          row.transactionType === 'consume' && details
            ? -details.reduce(
                (total: number, item: any) => total + item.creditsConsumed,
                0
              )
            : convert(row.credits),
        remainingCredits: convert(row.remainingCredits),
        consumedDetail: details ? JSON.stringify(details) : row.consumedDetail,
      })
      .where(eq(credit.id, row.id));
  }
  for (const row of snapshot.orders) {
    if (row.creditsAmount !== null)
      await tx
        .update(order)
        .set({ creditsAmount: convert(row.creditsAmount) })
        .where(eq(order.id, row.id));
  }
  for (const row of snapshot.subscriptions) {
    if (row.creditsAmount !== null)
      await tx
        .update(subscription)
        .set({ creditsAmount: convert(row.creditsAmount) })
        .where(eq(subscription.id, row.id));
  }
  for (const row of snapshot.tasks) {
    const creditId = row.taskInfo
      ? JSON.parse(row.taskInfo).creditId
      : row.creditId;
    await tx
      .update(aiTask)
      .set({
        costCredits:
          convertedConsumption.get(creditId) ?? convert(row.costCredits),
      })
      .where(eq(aiTask.id, row.id));
  }
  if (initial && Number(initial.value) > 0) {
    await tx
      .update(config)
      .set({ value: String(convert(Number(initial.value))) })
      .where(eq(config.name, initial.name));
  }
  const convertCatalog = (amount: number) =>
    convertLegacyCredits(
      amount,
      ratio ? numerator : 37,
      ratio ? denominator : 2400
    );
  for (const row of snapshot.packs)
    await tx
      .update(creditTopUpProduct)
      .set({ enabled: false, credits: convertCatalog(row.credits) })
      .where(eq(creditTopUpProduct.productId, row.productId));
  for (const row of snapshot.plans)
    await tx
      .update(subscriptionPlan)
      .set({ enabled: false, credits: convertCatalog(row.credits) })
      .where(eq(subscriptionPlan.productId, row.productId));
  for (const [index, pack] of CREDIT_PACKS.entries()) {
    const values = {
      ...pack,
      description: '',
      currency: 'usd',
      creditsValidDays: 0,
      enabled: true,
      sort: (index + 1) * 10,
    };
    if (snapshot.packs.some((row: any) => row.productId === pack.productId))
      throw new Error(`Reserved product ID already exists: ${pack.productId}`);
    await tx.insert(creditTopUpProduct).values(values);
  }
  for (const [index, plan] of SUBSCRIPTION_PLANS.entries()) {
    const yearly = plan.interval === 'year';
    if (snapshot.plans.some((row: any) => row.productId === plan.productId))
      throw new Error(`Reserved product ID already exists: ${plan.productId}`);
    await tx.insert(subscriptionPlan).values({
      ...plan,
      nameEn: plan.name,
      nameZh: plan.name,
      descriptionEn: '',
      descriptionZh: '',
      badgeEn: plan.name === 'Studio' ? 'Best value' : '',
      badgeZh: plan.name === 'Studio' ? '超值之选' : '',
      featuresEn: `HD video, no watermark\nDownload & post anywhere\n${yearly ? 'All year’s credits up front' : 'Credits refresh every month'}\nCancel anytime`,
      featuresZh: `高清视频，无水印\n下载与分享\n${yearly ? '全年积分一次发放' : '每月刷新积分'}\n随时取消续费`,
      compareAtPriceInCents: null,
      currency: 'usd',
      intervalCount: 1,
      creditsValidDays: yearly ? 365 : 31,
      enabled: true,
      sort: ((index % 3) + 1) * 10,
    });
  }
  if (configs.some((row: any) => row.name === VIDEO_PRICING_VERSION_KEY)) {
    await tx
      .update(config)
      .set({ value: VIDEO_PRICING_VERSION })
      .where(eq(config.name, VIDEO_PRICING_VERSION_KEY));
  } else {
    await tx.insert(config).values({
      name: VIDEO_PRICING_VERSION_KEY,
      value: VIDEO_PRICING_VERSION,
    });
  }
  const expected = {
    credits: await tx.select().from(credit),
    orders: await tx.select().from(order),
    subscriptions: await tx.select().from(subscription),
    tasks: await tx.select().from(aiTask),
    packs: await tx.select().from(creditTopUpProduct),
    plans: await tx.select().from(subscriptionPlan),
    configs: await tx.select().from(config),
  };
  writeFileSync(
    backup,
    JSON.stringify(
      { version: VIDEO_PRICING_VERSION, ratio: ratioArg, snapshot, expected },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(
    'Pricing v2 installed atomically. Restart application writers before accepting traffic.'
  );
});
