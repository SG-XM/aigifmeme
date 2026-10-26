/** Same-site return paths for the auth modal and OAuth round-trip. */
const AUTH_PATH =
  /^\/(sign-in|sign-up|verify-email|forgot-password|reset-password|redeem-invite)(\/|\?|#|$)/;

export function isSafeAuthCallback(
  value: string | null | undefined
): value is string {
  return (
    !!value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !AUTH_PATH.test(value)
  );
}

const INTENT_KEY = 'bulin-auth-intent';
export const AUTH_INTENT_MAX_AGE_MS = 30 * 60 * 1000;

export type AuthIntent = 'generate' | 'purchase';

export function isFreshTimestamp(
  savedAt: number,
  now = Date.now(),
  maxAge = AUTH_INTENT_MAX_AGE_MS
) {
  return Number.isFinite(savedAt) && savedAt <= now && now - savedAt <= maxAge;
}

export function rememberAuthIntent(action: AuthIntent) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(
    INTENT_KEY,
    JSON.stringify({ action, at: Date.now() })
  );
}

/** Read and clear the pending post-login action. Expired values are dropped. */
export function takeAuthIntent(now = Date.now()): AuthIntent | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(INTENT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(INTENT_KEY);
  try {
    const parsed = JSON.parse(raw) as { action?: string; at?: number };
    if (!isFreshTimestamp(parsed.at ?? 0, now)) return null;
    if (parsed.action === 'generate' || parsed.action === 'purchase')
      return parsed.action;
  } catch {
    return null;
  }
  return null;
}
