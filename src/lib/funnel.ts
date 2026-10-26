import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import { funnelEvent } from '@/config/db/schema';
import { RECALL_EVENTS } from '@/lib/email-recall';
import {
  sanitizeFunnelMetadata,
  type FunnelEventMetadata,
  type FunnelEventName,
} from '@/lib/funnel-events';
import { getUuid } from '@/lib/hash';

export {
  FUNNEL_CHECKOUT_EVENTS,
  FUNNEL_EVENT_NAMES,
  FUNNEL_STEP_NAMES,
  type FunnelCheckoutEvent,
  type FunnelEventMetadata,
  type FunnelEventName,
} from '@/lib/funnel-events';

/** Records a stage and links earlier anonymous events after authentication. */
export async function recordFunnelEvent(
  eventName: FunnelEventName | (typeof RECALL_EVENTS)[number],
  visitorId: string,
  userId?: string | null,
  metadata?: FunnelEventMetadata | null
) {
  const database = db();
  if (userId) {
    await database
      .update(funnelEvent)
      .set({ userId })
      .where(
        and(eq(funnelEvent.visitorId, visitorId), isNull(funnelEvent.userId))
      );
  }

  const safe = sanitizeFunnelMetadata(metadata);
  await database.insert(funnelEvent).values({
    id: getUuid(),
    visitorId,
    userId: userId || null,
    eventName,
    ...(safe ? { metadata: JSON.stringify(safe) } : {}),
  });
}
