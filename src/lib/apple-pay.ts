import type {
  Stripe,
  StripeExpressCheckoutElementAvailablePaymentMethodsChangeEvent,
  StripeExpressCheckoutElementReadyEvent,
} from '@stripe/stripe-js';

const stripeByKey = new Map<string, Promise<Stripe | null>>();

export type CheckoutRedirect = {
  checkout_url?: string;
  apple_pay?: {
    status?: string;
    client_secret?: string | null;
  };
};

export function loadStripeClient(publishableKey: string) {
  const existing = stripeByKey.get(publishableKey);
  if (existing) return existing;
  // `@stripe/stripe-js` injects js.stripe.com. Keep that chunk off the
  // homepage graph until Apple Pay actually mounts or confirms.
  const pending = import('@stripe/stripe-js').then(({ loadStripe }) =>
    loadStripe(publishableKey)
  );
  stripeByKey.set(publishableKey, pending);
  return pending;
}

export function walletCurrency(currency: string | undefined) {
  const code = currency?.toLowerCase();
  return code === 'usd' || code === 'eur';
}

export type ApplePayMountReason =
  | 'not iphone'
  | 'no publishable key'
  | 'currency not usd or eur'
  | 'amount not positive'
  | 'eligible';

export function applePayMountDecision(input: {
  iphone: boolean;
  publishableKey: string;
  currency: string;
  amount: number;
}): { mount: boolean; reason: ApplePayMountReason } {
  if (!input.iphone) return { mount: false, reason: 'not iphone' };
  if (!input.publishableKey)
    return { mount: false, reason: 'no publishable key' };
  if (!walletCurrency(input.currency))
    return { mount: false, reason: 'currency not usd or eur' };
  if (!(input.amount > 0))
    return { mount: false, reason: 'amount not positive' };
  return { mount: true, reason: 'eligible' };
}

/**
 * iPhone, including Request Desktop Website.
 * That mode reports Macintosh or MacIntel and a touch screen.
 * The iPad mobile user agent stays excluded. Does not call canMakePayment.
 */
export function isIphone(
  userAgent?: string,
  maxTouchPoints?: number,
  platform?: string
) {
  const live =
    userAgent === undefined &&
    maxTouchPoints === undefined &&
    platform === undefined;
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const ua = userAgent ?? (live ? nav?.userAgent || '' : '');
  if (/iPhone/.test(ua)) return true;
  if (/iPad/.test(ua) || /Android/.test(ua)) return false;
  const touch = maxTouchPoints ?? (live ? nav?.maxTouchPoints || 0 : 0);
  if (!(touch > 1)) return false;
  if (/Macintosh/.test(ua)) return true;
  const plat = platform ?? (live ? nav?.platform || '' : '');
  return plat === 'MacIntel';
}

/**
 * True only when Express Checkout will paint Apple Pay.
 * `paymentMethods` stays an object when every wallet is unavailable.
 */
export function expressCheckoutHasApplePay(
  event:
    | StripeExpressCheckoutElementReadyEvent
    | StripeExpressCheckoutElementAvailablePaymentMethodsChangeEvent
) {
  if ('paymentMethods' in event) {
    return event.paymentMethods?.applePay?.available === true;
  }
  return event.availablePaymentMethods?.applePay === true;
}

const RETRYABLE_STRIPE_TYPES = new Set([
  'api_connection_error',
  'rate_limit_error',
]);
const SECRET_KEY = /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g;
const PUBLISHABLE_KEY = /pk_(?:live|test)_[A-Za-z0-9]{5,}/g;

type StripeErrorFields = {
  type: string;
  code: string;
  message: string;
};

function readStripeErrorRecord(value: unknown, fields: StripeErrorFields) {
  if (!value || typeof value !== 'object') return;
  const record = value as { type?: unknown; code?: unknown; message?: unknown };
  if (!fields.type && typeof record.type === 'string' && record.type) {
    fields.type = record.type;
  }
  if (!fields.code && typeof record.code === 'string' && record.code) {
    fields.code = record.code;
  }
  if (typeof record.message === 'string' && record.message) {
    fields.message = record.message;
  }
}

function stripeErrorFields(error: unknown): StripeErrorFields {
  const fields: StripeErrorFields = {
    type: '',
    code: '',
    message: 'Stripe error',
  };
  if (error instanceof Error) fields.message = error.message || fields.message;
  readStripeErrorRecord(error, fields);
  if (error && typeof error === 'object' && 'error' in error) {
    readStripeErrorRecord((error as { error?: unknown }).error, fields);
  }
  return fields;
}

function redactSecrets(text: string) {
  return text
    .replace(SECRET_KEY, '[redacted]')
    .replace(PUBLISHABLE_KEY, (key) => `${key.slice(0, 12)}…`);
}

/** Connection failures Stripe.js reports while an element session is opening. */
export function isRetryableStripeConnection(error: unknown) {
  const fields = stripeErrorFields(error);
  return (
    RETRYABLE_STRIPE_TYPES.has(fields.type) || fields.code === 'lock_timeout'
  );
}

export function clipJson(value: unknown) {
  try {
    const text = JSON.stringify(value);
    if (!text) return '(none)';
    const clipped = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    return redactSecrets(clipped);
  } catch {
    return '(unserializable)';
  }
}

export function stripeErrorSummary(error: unknown) {
  const fields = stripeErrorFields(error);
  const text = fields.type
    ? `${fields.type}: ${fields.message}`
    : fields.message;
  return redactSecrets(text).slice(0, 240);
}

export async function settleCheckout(
  data: CheckoutRedirect,
  publishableKey?: string
) {
  if (data.apple_pay?.status === 'requires_action') {
    if (!publishableKey || !data.apple_pay.client_secret) {
      throw new Error('Apple Pay could not be confirmed');
    }
    const stripe = await loadStripeClient(publishableKey);
    if (!stripe) throw new Error('Apple Pay could not be confirmed');
    const { error } = await stripe.handleNextAction({
      clientSecret: data.apple_pay.client_secret,
    });
    if (error) {
      throw new Error(error.message || 'Apple Pay authentication failed');
    }
  }
  if (!data.checkout_url) throw new Error('Checkout URL missing');
  window.location.assign(data.checkout_url);
}
