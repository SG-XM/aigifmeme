import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CreditCard, Shield, Users } from 'lucide-react';

import { apiGet } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type PaymentStats = {
  paidOrderCount: number;
  byCurrency: Array<{
    currency: string;
    orderCount: number;
    amount: number;
    averageOrderAmount: number;
  }>;
};

function formatMinorAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

function AdminPage() {
  const usersQuery = useQuery({
    queryKey: ['admin-users-total'],
    queryFn: () => apiGet<{ total: number }>('/api/admin/users'),
  });
  const rolesQuery = useQuery({
    queryKey: ['admin-roles-total'],
    queryFn: () => apiGet<{ total: number }>('/api/admin/roles'),
  });
  const paymentStatsQuery = useQuery({
    queryKey: ['admin-payment-stats'],
    queryFn: () => apiGet<PaymentStats>('/api/admin/payment-stats'),
  });

  const stats = {
    users: usersQuery.data?.total ?? 0,
    roles: rolesQuery.data?.total ?? 0,
  };
  const paymentStats = paymentStatsQuery.data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.title']()}</h1>
        <p className="text-muted-foreground">{m['admin.description']()}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {m['admin.stats.total_users']()}
            </CardTitle>
            <Users className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {m['admin.stats.roles']()}
            </CardTitle>
            <Shield className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.roles}</div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4" aria-labelledby="admin-payment-stats">
        <div>
          <h2 id="admin-payment-stats" className="text-lg font-semibold">
            {m['admin.stats.payment_overview']()}
          </h2>
          <p className="text-muted-foreground text-sm">
            {m['admin.stats.payment_overview_description']()}
          </p>
          {paymentStatsQuery.isError ? (
            <p role="status" className="text-destructive text-sm">
              {m['admin.stats.payment_stats_error']()}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {m['admin.stats.paid_orders']()}
              </CardTitle>
              <CreditCard className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              {paymentStatsQuery.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {paymentStatsQuery.isError
                    ? '—'
                    : (paymentStats?.paidOrderCount ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {m['admin.stats.payment_revenue']()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {paymentStats?.byCurrency.length ? (
                paymentStats.byCurrency.map((item) => (
                  <div
                    key={item.currency}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="text-muted-foreground text-sm">
                      {item.currency}
                    </span>
                    <span className="font-semibold">
                      {formatMinorAmount(item.amount, item.currency)}
                    </span>
                  </div>
                ))
              ) : paymentStatsQuery.isLoading ? (
                <Skeleton className="h-6 w-28" />
              ) : (
                <div className="text-muted-foreground text-sm">—</div>
              )}
              <p className="text-muted-foreground pt-1 text-xs">
                {m['admin.stats.payment_revenue_note']()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {m['admin.stats.average_order_amount']()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {paymentStats?.byCurrency.length ? (
                paymentStats.byCurrency.map((item) => (
                  <div
                    key={item.currency}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="text-muted-foreground text-sm">
                      {item.currency}
                    </span>
                    <span className="font-semibold">
                      {formatMinorAmount(
                        item.averageOrderAmount,
                        item.currency
                      )}
                    </span>
                  </div>
                ))
              ) : paymentStatsQuery.isLoading ? (
                <Skeleton className="h-6 w-28" />
              ) : (
                <div className="text-muted-foreground text-sm">—</div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute('/admin/')({
  component: AdminPage,
});
