/** Client-safe funnel event names and metadata. Do not import the database here. */

export const FUNNEL_STEP_NAMES = [
  'photo_selected',
  'authenticated',
  'paywall_shown',
  'checkout_created',
  'payment_succeeded',
] as const;

/** Checkout diagnostics. Counted in admin, outside the original conversion chain. */
export const FUNNEL_CHECKOUT_EVENTS = [
  'checkout_click',
  'checkout_signin_redirect',
  'checkout_create_failed',
  'checkout_redirected',
  'checkout_cancel_return',
] as const;

export const FUNNEL_EVENT_NAMES = [
  ...FUNNEL_STEP_NAMES,
  ...FUNNEL_CHECKOUT_EVENTS,
] as const;

export type FunnelStepName = (typeof FUNNEL_STEP_NAMES)[number];
export type FunnelCheckoutEvent = (typeof FUNNEL_CHECKOUT_EVENTS)[number];
export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export type FunnelEventMetadata = {
  productId?: string;
  priceInCents?: number;
  currency?: string;
  placement?: string;
  provider?: string;
  source?: 'client' | 'server';
  errorCode?: string;
  errorMessage?: string;
};

const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PLACEMENT = /^[a-z0-9-]{1,64}$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const PROVIDER = /^[a-z0-9_-]{1,32}$/;
const ERROR_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

export function truncateFunnelText(
  value: unknown,
  max: number
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

/** Drops anything that is not a short analytic field. Never throws. */
export function sanitizeFunnelMetadata(
  input: Partial<Record<keyof FunnelEventMetadata, unknown>> | null | undefined
): FunnelEventMetadata | null {
  if (!input || typeof input !== 'object') return null;
  const metadata: FunnelEventMetadata = {};
  if (typeof input.productId === 'string' && PRODUCT_ID.test(input.productId))
    metadata.productId = input.productId;
  if (
    typeof input.priceInCents === 'number' &&
    Number.isInteger(input.priceInCents) &&
    input.priceInCents >= 0 &&
    input.priceInCents <= 100_000_000
  ) {
    metadata.priceInCents = input.priceInCents;
  }
  if (typeof input.currency === 'string' && CURRENCY.test(input.currency))
    metadata.currency = input.currency.toLowerCase();
  if (typeof input.placement === 'string' && PLACEMENT.test(input.placement))
    metadata.placement = input.placement;
  if (typeof input.provider === 'string' && PROVIDER.test(input.provider))
    metadata.provider = input.provider;
  if (input.source === 'client' || input.source === 'server')
    metadata.source = input.source;
  if (typeof input.errorCode === 'string' && ERROR_CODE.test(input.errorCode))
    metadata.errorCode = input.errorCode;
  const errorMessage = truncateFunnelText(input.errorMessage, 180);
  if (errorMessage) metadata.errorMessage = errorMessage;
  return Object.keys(metadata).length ? metadata : null;
}

export type FunnelStepStat = {
  eventName: FunnelEventName;
  visitors: number;
  conversionFromPrevious: number | null;
  dropOff: number | null;
};

function countOf(
  counts: ReadonlyMap<string, number> | Record<string, number>,
  name: string
) {
  if (counts instanceof Map) return Number(counts.get(name)) || 0;
  return Number(counts[name]) || 0;
}

/**
 * Original five stages keep their conversion math. Checkout diagnostics are
 * appended so a new zero-count step cannot rewrite historical drop-off.
 */
export function funnelStepsFromCounts(
  counts: ReadonlyMap<string, number> | Record<string, number>
): FunnelStepStat[] {
  let previous: number | null = null;
  const steps: FunnelStepStat[] = FUNNEL_STEP_NAMES.map((eventName) => {
    const visitors = countOf(counts, eventName);
    const step: FunnelStepStat = {
      eventName,
      visitors,
      conversionFromPrevious:
        previous === null || previous === 0 ? null : visitors / previous,
      dropOff: previous === null ? null : Math.max(0, previous - visitors),
    };
    previous = visitors;
    return step;
  });
  for (const eventName of FUNNEL_CHECKOUT_EVENTS) {
    steps.push({
      eventName,
      visitors: countOf(counts, eventName),
      conversionFromPrevious: null,
      dropOff: null,
    });
  }
  return steps;
}
