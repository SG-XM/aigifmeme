import { asc, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { creditTopUpProduct, subscriptionPlan } from '@/config/db/schema';

export type SubscriptionPlanInput = {
  productId: string;
  nameEn: string;
  nameZh: string;
  nameEs: string;
  descriptionEn: string;
  descriptionZh: string;
  descriptionEs: string;
  featuresEn: string;
  featuresZh: string;
  featuresEs: string;
  badgeEn: string;
  badgeZh: string;
  badgeEs: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  interval: 'month' | 'year';
  intervalCount: number;
  credits: number;
  creditsValidDays: number;
  featured: boolean;
  enabled: boolean;
  sort: number;
};

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateText(value: string, label: string, max: number) {
  if (value.length > max)
    throw new Error(`${label} must be at most ${max} characters`);
}

export function parseSubscriptionPlanInput(
  value: unknown
): SubscriptionPlanInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid subscription plan');
  }
  const input = value as Record<string, unknown>;
  const productId = stringValue(input.productId);
  const nameEn = stringValue(input.nameEn);
  const nameZh = stringValue(input.nameZh);
  const nameEs = stringValue(input.nameEs) || nameEn;
  const descriptionEn = stringValue(input.descriptionEn);
  const descriptionZh = stringValue(input.descriptionZh);
  const descriptionEs = stringValue(input.descriptionEs);
  const featuresEn = stringValue(input.featuresEn);
  const featuresZh = stringValue(input.featuresZh);
  const featuresEs = stringValue(input.featuresEs);
  const badgeEn = stringValue(input.badgeEn);
  const badgeZh = stringValue(input.badgeZh);
  const badgeEs = stringValue(input.badgeEs);
  const {
    priceInCents,
    compareAtPriceInCents,
    interval,
    intervalCount,
    credits,
    creditsValidDays,
    sort,
  } = input;

  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(productId)) {
    throw new Error(
      'Product ID must be 2–64 lowercase letters, numbers, - or _'
    );
  }
  if (!nameEn || !nameZh)
    throw new Error('English and Chinese names are required');
  validateText(nameEn, 'English name', 100);
  validateText(nameZh, 'Chinese name', 100);
  validateText(nameEs, 'Spanish name', 100);
  validateText(descriptionEn, 'English description', 240);
  validateText(descriptionZh, 'Chinese description', 240);
  validateText(descriptionEs, 'Spanish description', 240);
  validateText(featuresEn, 'English features', 2000);
  validateText(featuresZh, 'Chinese features', 2000);
  validateText(featuresEs, 'Spanish features', 2000);
  validateText(badgeEn, 'English badge', 80);
  validateText(badgeZh, 'Chinese badge', 80);
  validateText(badgeEs, 'Spanish badge', 80);
  for (const [label, features] of [
    ['English', featuresEn],
    ['Chinese', featuresZh],
    ['Spanish', featuresEs],
  ]) {
    const lines = features
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean);
    if (lines.length > 12 || lines.some((line) => line.length > 160)) {
      throw new Error(
        `${label} features allow up to 12 lines of 160 characters`
      );
    }
  }
  if (
    typeof priceInCents !== 'number' ||
    !Number.isSafeInteger(priceInCents) ||
    priceInCents < 1 ||
    priceInCents > 100_000_000
  ) {
    throw new Error('Price must be a positive integer number of cents');
  }
  if (
    compareAtPriceInCents !== null &&
    (typeof compareAtPriceInCents !== 'number' ||
      !Number.isSafeInteger(compareAtPriceInCents) ||
      compareAtPriceInCents < priceInCents ||
      compareAtPriceInCents > 100_000_000)
  ) {
    throw new Error(
      'Original price must be greater than or equal to the price'
    );
  }
  if (interval !== 'month' && interval !== 'year')
    throw new Error('Interval must be month or year');
  if (
    typeof intervalCount !== 'number' ||
    !Number.isSafeInteger(intervalCount) ||
    intervalCount < 1 ||
    intervalCount > 12
  ) {
    throw new Error('Interval count must be between 1 and 12');
  }
  if (
    typeof credits !== 'number' ||
    !Number.isSafeInteger(credits) ||
    credits < 1 ||
    credits > 1_000_000_000
  ) {
    throw new Error('Credits must be a positive integer');
  }
  if (
    typeof creditsValidDays !== 'number' ||
    !Number.isSafeInteger(creditsValidDays) ||
    creditsValidDays < 1 ||
    creditsValidDays > 3650
  ) {
    throw new Error('Credit validity must be between 1 and 3650 days');
  }
  if (
    typeof input.featured !== 'boolean' ||
    typeof input.enabled !== 'boolean'
  ) {
    throw new Error('Featured and enabled must be true or false');
  }
  if (
    typeof sort !== 'number' ||
    !Number.isSafeInteger(sort) ||
    Math.abs(sort) > 100000
  ) {
    throw new Error('Sort order must be an integer between -100000 and 100000');
  }

  return {
    productId,
    nameEn,
    nameZh,
    nameEs,
    descriptionEn,
    descriptionZh,
    descriptionEs,
    featuresEn,
    featuresZh,
    featuresEs,
    badgeEn,
    badgeZh,
    badgeEs,
    priceInCents,
    compareAtPriceInCents,
    interval,
    intervalCount,
    credits,
    creditsValidDays,
    featured: input.featured,
    enabled: input.enabled,
    sort,
  };
}

export async function listSubscriptionPlansForAdmin() {
  return db()
    .select()
    .from(subscriptionPlan)
    .orderBy(asc(subscriptionPlan.sort), asc(subscriptionPlan.productId));
}

export async function listEnabledSubscriptionPlans(
  locale: 'en' | 'zh' | 'es' | 'ar'
) {
  const rows = await db()
    .select()
    .from(subscriptionPlan)
    .where(eq(subscriptionPlan.enabled, true))
    .orderBy(asc(subscriptionPlan.sort), asc(subscriptionPlan.productId));
  return rows.map((plan: typeof subscriptionPlan.$inferSelect) => ({
    productId: plan.productId,
    name:
      locale === 'zh'
        ? plan.nameZh
        : locale === 'es'
          ? plan.nameEs || plan.nameEn
          : plan.nameEn,
    description:
      locale === 'zh'
        ? plan.descriptionZh
        : locale === 'es'
          ? plan.descriptionEs || plan.descriptionEn
          : plan.descriptionEn,
    features: (locale === 'zh'
      ? plan.featuresZh
      : locale === 'es'
        ? plan.featuresEs || plan.featuresEn
        : plan.featuresEn
    )
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean),
    badge:
      locale === 'zh'
        ? plan.badgeZh
        : locale === 'es'
          ? plan.badgeEs || plan.badgeEn
          : plan.badgeEn,
    priceInCents: plan.priceInCents,
    compareAtPriceInCents: plan.compareAtPriceInCents,
    currency: plan.currency,
    interval: plan.interval,
    intervalCount: plan.intervalCount,
    credits: plan.credits,
    creditsValidDays: plan.creditsValidDays,
    featured: plan.featured,
    sort: plan.sort,
  }));
}

export async function getEnabledSubscriptionPlan(productId: string) {
  const [plan] = await db()
    .select()
    .from(subscriptionPlan)
    .where(eq(subscriptionPlan.productId, productId))
    .limit(1);
  return plan?.enabled ? plan : null;
}

export async function createSubscriptionPlan(input: SubscriptionPlanInput) {
  const [topUp] = await db()
    .select({ productId: creditTopUpProduct.productId })
    .from(creditTopUpProduct)
    .where(eq(creditTopUpProduct.productId, input.productId))
    .limit(1);
  if (topUp) throw new Error('Product ID is already used by a top-up package');
  await db()
    .insert(subscriptionPlan)
    .values({ ...input, currency: 'usd' });
}

export async function updateSubscriptionPlan(input: SubscriptionPlanInput) {
  await db()
    .update(subscriptionPlan)
    .set({
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      nameEs: input.nameEs,
      descriptionEn: input.descriptionEn,
      descriptionZh: input.descriptionZh,
      descriptionEs: input.descriptionEs,
      featuresEn: input.featuresEn,
      featuresZh: input.featuresZh,
      featuresEs: input.featuresEs,
      badgeEn: input.badgeEn,
      badgeZh: input.badgeZh,
      badgeEs: input.badgeEs,
      priceInCents: input.priceInCents,
      compareAtPriceInCents: input.compareAtPriceInCents,
      interval: input.interval,
      intervalCount: input.intervalCount,
      credits: input.credits,
      creditsValidDays: input.creditsValidDays,
      featured: input.featured,
      enabled: input.enabled,
      sort: input.sort,
    })
    .where(eq(subscriptionPlan.productId, input.productId));
  const [result] = await db()
    .select({ productId: subscriptionPlan.productId })
    .from(subscriptionPlan)
    .where(eq(subscriptionPlan.productId, input.productId))
    .limit(1);
  return result ?? null;
}
