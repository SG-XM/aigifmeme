export const RECALL_EVENTS = [
  'recall_clicked',
  'recall_checkout_created',
  'recall_payment_succeeded',
] as const;
export type RecallKind = 'checkout' | 'paywall';
export type RecallLocale = 'en' | 'es';
export const RECALL_LINK_LIFETIME = 7 * 24 * 60 * 60_000;
export const RECALL_CANDIDATE_WINDOW = 24 * 60 * 60_000;
export const RECALL_CHECKOUT_CACHE = 10 * 60_000;
const RECALL_QUOTA_ERRORS = new Set([
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
]);
const RECALL_QUOTA_MESSAGES = [
  'exceeded your daily email sending quota',
  'exceeded your monthly email sending quota',
];
export const RECALL_PAUSE_CONFIG_KEY = 'email_recall_paused_until';
export const RECALL_DAILY_COUNTER_KEY = 'email_recall_daily_reserved';
export const RECALL_MONTHLY_COUNTER_KEY = 'email_recall_monthly_reserved';
export const DEFAULT_RECALL_DAILY_LIMIT = 80;
export const DEFAULT_RECALL_MONTHLY_LIMIT = 2500;
export const RECALL_SEND_BATCH = 25;
export type RecallSendLimits = { daily: number; monthly: number };
export function recallLocale(value: string): RecallLocale {
  return value.toLowerCase().startsWith('es') ? 'es' : 'en';
}
export function dueRecall(
  checkoutAt: Date | null,
  paywallAt: Date | null,
  now = Date.now()
): { kind: RecallKind; triggeredAt: Date } | null {
  if (checkoutAt) {
    return now - checkoutAt.getTime() >= 30 * 60_000
      ? { kind: 'checkout', triggeredAt: checkoutAt }
      : null;
  }
  return paywallAt && now - paywallAt.getTime() >= 2 * 60 * 60_000
    ? { kind: 'paywall', triggeredAt: paywallAt }
    : null;
}

/** Next UTC midnight, when Resend's daily send quota resets. */
export function recallQuotaPauseUntil(now = Date.now()): string {
  const date = new Date(now);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  ).toISOString();
}

/**
 * Resend quota failures. Per-second rate_limit_exceeded is not a quota.
 * The documented name is preferred; the official quota sentence still counts
 * when the SDK or a proxy drops or renames the error.
 */
export function isRecallQuotaError(
  errorName?: string,
  errorMessage?: string
): boolean {
  if (errorName && RECALL_QUOTA_ERRORS.has(errorName)) return true;
  const message = errorMessage?.toLowerCase() ?? '';
  return RECALL_QUOTA_MESSAGES.some((fragment) => message.includes(fragment));
}

/** Empty or non-integer values use the default. Zero is a real stop. */
export function parseRecallSendLimit(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function recallSendLimits(
  configs: Record<string, string | undefined>
): RecallSendLimits {
  return {
    daily: parseRecallSendLimit(
      configs.email_recall_daily_limit,
      DEFAULT_RECALL_DAILY_LIMIT
    ),
    monthly: parseRecallSendLimit(
      configs.email_recall_monthly_limit,
      DEFAULT_RECALL_MONTHLY_LIMIT
    ),
  };
}

export function recallUtcDayPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function recallUtcMonthPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function recallUtcDayRange(now = new Date()) {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return { start: new Date(start), end: new Date(start + 86_400_000) };
}

export function recallUtcMonthRange(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return { start: new Date(start), end: new Date(end) };
}

/** `YYYY-MM-DD:count` or `YYYY-MM:count`. Anything else is not a live counter. */
export function parseRecallCounter(
  value: string | null | undefined
): { period: string; count: number } | null {
  const match = /^(\d{4}-\d{2}(?:-\d{2})?):(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const count = Number(match[2]);
  return Number.isSafeInteger(count) ? { period: match[1], count } : null;
}
export type RecallLanding =
  | { status: 'sign-in'; locale: RecallLocale }
  | { status: 'invalid' | 'expired' | 'paid' | 'unavailable' }
  | {
      status: 'ready';
      locale: RecallLocale;
      productName: string;
      amount: number;
      currency: string;
      subscription: boolean;
      interval: string | null;
    };
