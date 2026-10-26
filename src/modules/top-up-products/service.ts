import { and, asc, eq, notInArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { creditTopUpProduct, subscriptionPlan } from '@/config/db/schema';
import { RETENTION_OFFER_PRODUCT_IDS } from '@/lib/video-retention-offer';

export type TopUpProductInput = {
  productId: string;
  name: string;
  description: string;
  nameEs: string;
  descriptionEs: string;
  priceInCents: number;
  credits: number;
  creditsValidDays: number;
  enabled: boolean;
  sort: number;
};

export function parseTopUpProductInput(value: unknown): TopUpProductInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid product');
  }

  const input = value as Record<string, unknown>;
  const productId = typeof input.productId === 'string' ? input.productId : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description =
    typeof input.description === 'string' ? input.description.trim() : '';
  const nameEs =
    typeof input.nameEs === 'string' && input.nameEs.trim()
      ? input.nameEs.trim()
      : name;
  const descriptionEs =
    typeof input.descriptionEs === 'string'
      ? input.descriptionEs.trim()
      : description;
  const priceInCents = input.priceInCents;
  const credits = input.credits;
  const creditsValidDays = input.creditsValidDays;
  const sort = input.sort;

  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(productId)) {
    throw new Error(
      'Product ID must be 2–64 lowercase letters, numbers, - or _'
    );
  }
  if (!name || name.length > 80) {
    throw new Error('Name is required and must be at most 80 characters');
  }
  if (description.length > 240) {
    throw new Error('Description must be at most 240 characters');
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
    creditsValidDays < 0 ||
    creditsValidDays > 3650
  ) {
    throw new Error('Validity must be between 0 and 3650 days');
  }
  if (
    typeof sort !== 'number' ||
    !Number.isSafeInteger(sort) ||
    Math.abs(sort) > 100000
  ) {
    throw new Error('Sort order must be an integer between -100000 and 100000');
  }
  if (typeof input.enabled !== 'boolean') {
    throw new Error('Enabled must be true or false');
  }

  if (nameEs.length > 80) {
    throw new Error('Spanish name must be at most 80 characters');
  }
  if (descriptionEs.length > 240) {
    throw new Error('Spanish description must be at most 240 characters');
  }

  return {
    productId,
    name,
    description,
    nameEs,
    descriptionEs,
    priceInCents,
    credits,
    creditsValidDays,
    enabled: input.enabled,
    sort,
  };
}

export async function listTopUpProductsForAdmin() {
  return db()
    .select()
    .from(creditTopUpProduct)
    .orderBy(asc(creditTopUpProduct.sort), asc(creditTopUpProduct.productId));
}

export async function listEnabledTopUpProducts(
  locale: 'en' | 'zh' | 'es' | 'ar'
) {
  return db()
    .select({
      productId: creditTopUpProduct.productId,
      name:
        locale === 'es' ? creditTopUpProduct.nameEs : creditTopUpProduct.name,
      description:
        locale === 'es'
          ? creditTopUpProduct.descriptionEs
          : creditTopUpProduct.description,
      priceInCents: creditTopUpProduct.priceInCents,
      currency: creditTopUpProduct.currency,
      credits: creditTopUpProduct.credits,
      creditsValidDays: creditTopUpProduct.creditsValidDays,
      sort: creditTopUpProduct.sort,
    })
    .from(creditTopUpProduct)
    .where(
      and(
        eq(creditTopUpProduct.enabled, true),
        notInArray(creditTopUpProduct.productId, [
          ...RETENTION_OFFER_PRODUCT_IDS,
        ])
      )
    )
    .orderBy(asc(creditTopUpProduct.sort), asc(creditTopUpProduct.productId));
}

export async function getEnabledTopUpProduct(productId: string) {
  const [product] = await db()
    .select()
    .from(creditTopUpProduct)
    .where(eq(creditTopUpProduct.productId, productId))
    .limit(1);
  return product?.enabled ? product : null;
}

export async function createTopUpProduct(input: TopUpProductInput) {
  const [plan] = await db()
    .select({ productId: subscriptionPlan.productId })
    .from(subscriptionPlan)
    .where(eq(subscriptionPlan.productId, input.productId))
    .limit(1);
  if (plan)
    throw new Error('Product ID is already used by a subscription plan');
  await db()
    .insert(creditTopUpProduct)
    .values({ ...input, currency: 'usd' });
}

export async function updateTopUpProduct(input: TopUpProductInput) {
  await db()
    .update(creditTopUpProduct)
    .set({
      name: input.name,
      description: input.description,
      nameEs: input.nameEs,
      descriptionEs: input.descriptionEs,
      priceInCents: input.priceInCents,
      credits: input.credits,
      creditsValidDays: input.creditsValidDays,
      enabled: input.enabled,
      sort: input.sort,
    })
    .where(eq(creditTopUpProduct.productId, input.productId));
  const [product] = await db()
    .select()
    .from(creditTopUpProduct)
    .where(eq(creditTopUpProduct.productId, input.productId))
    .limit(1);
  return product ?? null;
}
