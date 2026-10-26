import { createFileRoute } from '@tanstack/react-router';
import { and, count, eq, isNull, sql, sum } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { order } from '@/config/db/schema';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const isAdmin = await hasPermission(session.user.id, 'admin.*');
    if (!isAdmin) return respErr('Forbidden');

    const paidCondition = and(
      eq(order.status, 'paid'),
      isNull(order.deletedAt)
    );

    const currencyStats: {
      currency: string;
      orderCount: number;
      amount: string | null;
    }[] = await db()
      .select({
        currency: sql<string>`coalesce(${order.paymentCurrency}, ${order.currency})`,
        orderCount: count(),
        amount: sum(sql`coalesce(${order.paymentAmount}, ${order.amount})`),
      })
      .from(order)
      .where(paidCondition)
      .groupBy(sql`coalesce(${order.paymentCurrency}, ${order.currency})`);

    const paidOrderCount = currencyStats.reduce(
      (total, item) => total + item.orderCount,
      0
    );

    return respData({
      paidOrderCount,
      byCurrency: currencyStats.map((item) => {
        const amount = Number(item.amount || 0);
        return {
          currency: item.currency.toUpperCase(),
          orderCount: item.orderCount,
          amount,
          averageOrderAmount:
            item.orderCount > 0 ? Math.round(amount / item.orderCount) : 0,
        };
      }),
    });
  } catch (error: any) {
    console.error('admin payment stats error:', error);
    return respErr('Internal error');
  }
}

export const Route = createFileRoute('/api/admin/payment-stats')({
  server: {
    handlers: { GET },
  },
});
