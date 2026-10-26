import { createFileRoute } from '@tanstack/react-router';
import { and, count, desc, eq, gt, gte, or, type SQL } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { user } from '@/config/db/schema';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

const dimensions = {
  source: user.utmSource,
  medium: user.utmMedium,
  campaign: user.utmCampaign,
  term: user.utmTerm,
  content: user.utmContent,
  referrer: user.referrerDomain,
  country: user.countryCode,
} as const;

type Dimension = keyof typeof dimensions;

async function GET({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    if (!(await hasPermission(session.user.id, 'admin.*'))) {
      return respErr('Forbidden');
    }

    const { searchParams } = new URL(request.url);
    const requestedDays = searchParams.get('days') || '30';
    const days = ['7', '30', '90', 'all'].includes(requestedDays)
      ? requestedDays
      : '30';
    const conditions: SQL[] = [];
    if (days !== 'all') {
      const since = new Date();
      since.setDate(since.getDate() - Number(days));
      conditions.push(gte(user.createdAt, since));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [totals] = await db()
      .select({ registrations: count() })
      .from(user)
      .where(where);
    const [attributed] = await db()
      .select({ registrations: count() })
      .from(user)
      .where(
        and(where, or(gt(user.utmSource, ''), gt(user.referrerDomain, '')))
      );

    const grouped = await Promise.all(
      (Object.keys(dimensions) as Dimension[]).map(async (dimension) => {
        const column = dimensions[dimension];
        const rows = await db()
          .select({ value: column, registrations: count() })
          .from(user)
          .where(where)
          .groupBy(column)
          .orderBy(desc(count()))
          .limit(20);

        const typedRows = rows as Array<{
          value: string;
          registrations: number;
        }>;
        return [
          dimension,
          typedRows
            .map((row) => ({
              value: row.value || '',
              registrations: row.registrations,
            }))
            .filter((row) => dimension === 'country' || row.value),
        ] as const;
      })
    );

    return respData({
      days,
      registrations: totals.registrations,
      attributedRegistrations: attributed.registrations,
      dimensions: Object.fromEntries(grouped) as Record<
        Dimension,
        Array<{ value: string; registrations: number }>
      >,
    });
  } catch (error) {
    console.error('admin traffic source stats error:', error);
    return respErr('Internal error');
  }
}

export const Route = createFileRoute('/api/admin/traffic-sources')({
  server: {
    handlers: { GET },
  },
});
