/** Version marker prevents legacy balances/products funding new-priced renders. */
export const VIDEO_PRICING_VERSION = 'seedance-12s-v2';
export const VIDEO_PRICING_VERSION_KEY = 'video_credit_pricing_version';
export const STANDARD_VIDEO_CREDITS = 10;

export const CREDIT_PACKS = [
  { productId: 'single_v2', name: 'Single', priceInCents: 999, credits: 10 },
  { productId: 'duo_v2', name: 'Duo Pack', priceInCents: 2900, credits: 50 },
  { productId: 'crew_v2', name: 'Crew Pack', priceInCents: 9900, credits: 350 },
  {
    productId: 'studio_pack_v2',
    name: 'Studio Pack',
    priceInCents: 19900,
    credits: 900,
  },
  {
    productId: 'label_v2',
    name: 'Label Pack',
    priceInCents: 49900,
    credits: 3000,
  },
] as const;

/** Year plans grant their entire annual allowance at checkout/annual renewal. */
export const SUBSCRIPTION_PLANS = [
  {
    productId: 'basic_monthly_v2',
    name: 'Basic',
    interval: 'month',
    priceInCents: 2990,
    credits: 100,
    featured: true,
  },
  {
    productId: 'pro_monthly_v2',
    name: 'Pro',
    interval: 'month',
    priceInCents: 4990,
    credits: 300,
    featured: false,
  },
  {
    productId: 'studio_monthly_v2',
    name: 'Studio',
    interval: 'month',
    priceInCents: 9990,
    credits: 800,
    featured: false,
  },
  {
    productId: 'basic_yearly_v2',
    name: 'Basic',
    interval: 'year',
    priceInCents: 10000,
    credits: 400,
    featured: true,
  },
  {
    productId: 'pro_yearly_v2',
    name: 'Pro',
    interval: 'year',
    priceInCents: 50000,
    credits: 4000,
    featured: false,
  },
  {
    productId: 'studio_yearly_v2',
    name: 'Studio',
    interval: 'year',
    priceInCents: 60000,
    credits: 6000,
    featured: false,
  },
] as const;

/** Discounts compare cost per credit (same standard-video allowance basis). */
export function creditPriceSavings(
  offer: { priceInCents: number; credits: number },
  baseline: { priceInCents: number; credits: number }
) {
  if (offer.credits <= 0 || baseline.credits <= 0 || baseline.priceInCents <= 0)
    return 0;
  return Math.max(
    0,
    Math.round(
      100 *
        (1 -
          (offer.priceInCents * baseline.credits) /
            (offer.credits * baseline.priceInCents))
    )
  );
}

/** A legacy conversion policy is explicit; round balances in the user's favor. */
export function convertLegacyCredits(
  amount: number,
  numerator: number,
  denominator: number
) {
  if (
    ![amount, numerator, denominator].every(Number.isSafeInteger) ||
    numerator < 1 ||
    denominator < 1
  ) {
    throw new Error(
      'Credit conversion requires safe integers and a positive ratio'
    );
  }
  const absolute = BigInt(Math.abs(amount));
  const result =
    (absolute * BigInt(numerator) + BigInt(denominator) - 1n) /
    BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Converted credits exceed the safe integer range');
  return Number(result) * Math.sign(amount);
}
