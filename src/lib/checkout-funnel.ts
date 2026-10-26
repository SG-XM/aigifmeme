import {
  sanitizeFunnelMetadata,
  type FunnelCheckoutEvent,
  type FunnelEventMetadata,
} from '@/lib/funnel-events';

const recent = new Map<string, number>();
const DEDUPE_MS = 2000;

/** Fire-and-forget. A tracking failure must not block or reject checkout. */
export function trackCheckoutFunnel(
  event: FunnelCheckoutEvent,
  metadata?: FunnelEventMetadata | null,
  options?: { keepalive?: boolean }
) {
  try {
    const safe = sanitizeFunnelMetadata({ ...metadata, source: 'client' });
    const key = [
      event,
      safe?.productId ?? '',
      safe?.placement ?? '',
      safe?.provider ?? '',
      safe?.errorCode ?? '',
      safe?.errorMessage ?? '',
    ].join(':');
    const now = Date.now();
    const last = recent.get(key) ?? 0;
    if (now - last < DEDUPE_MS) return;
    recent.set(key, now);
    void fetch('/api/funnel/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...safe }),
      keepalive: options?.keepalive === true,
    }).catch(() => undefined);
  } catch {
    // Analytics is optional.
  }
}
