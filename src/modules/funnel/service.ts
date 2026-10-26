import { countDistinct, gte, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { funnelEvent } from '@/config/db/schema';
import { funnelStepsFromCounts } from '@/lib/funnel-events';

export type FunnelPeriod = '7' | '30' | '90' | 'all';

export async function getFunnelStats(days: FunnelPeriod) {
  const where =
    days === 'all'
      ? undefined
      : gte(
          funnelEvent.createdAt,
          new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
        );
  const rows = await db()
    .select({
      eventName: funnelEvent.eventName,
      visitors: countDistinct(
        sql`coalesce(${funnelEvent.userId}, ${funnelEvent.visitorId})`
      ),
    })
    .from(funnelEvent)
    .where(where)
    .groupBy(funnelEvent.eventName);

  const peopleByStage = new Map<string, number>();
  for (const row of rows)
    peopleByStage.set(row.eventName, Number(row.visitors));

  return {
    days,
    steps: funnelStepsFromCounts(peopleByStage),
  };
}
