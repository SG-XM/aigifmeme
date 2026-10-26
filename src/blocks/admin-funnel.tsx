import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';
import { type FunnelEventName } from '@/lib/funnel-events';
import { m } from '@/paraglide/messages.js';
import { AdminEmailRecall } from '@/blocks/admin-email-recall';
import {
  FunnelChart,
  type FunnelChartStage,
} from '@/components/admin/funnel-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type FunnelReport = {
  days: '7' | '30' | '90' | 'all';
  steps: Array<{
    eventName: FunnelEventName;
    visitors: number;
    conversionFromPrevious: number | null;
    dropOff: number | null;
  }>;
};

const stageLabels: Record<FunnelEventName, () => string> = {
  photo_selected: () => m['admin.funnel.photo'](),
  authenticated: () => m['admin.funnel.login'](),
  paywall_shown: () => m['admin.funnel.paywall'](),
  checkout_created: () => m['admin.funnel.checkout'](),
  payment_succeeded: () => m['admin.funnel.payment'](),
  checkout_click: () => m['admin.funnel.checkout_click'](),
  checkout_signin_redirect: () => m['admin.funnel.checkout_signin'](),
  checkout_create_failed: () => m['admin.funnel.checkout_failed'](),
  checkout_redirected: () => m['admin.funnel.checkout_redirected'](),
  checkout_cancel_return: () => m['admin.funnel.checkout_cancel'](),
};

export function AdminFunnel() {
  const [days, setDays] = useState<FunnelReport['days']>('30');
  const report = useQuery({
    queryKey: ['admin-funnel', days],
    queryFn: () =>
      apiGet<FunnelReport>(
        `/api/admin/funnel?days=${encodeURIComponent(days)}`
      ),
  });
  const stages: FunnelChartStage[] = (report.data?.steps ?? []).map((step) => ({
    label: stageLabels[step.eventName]?.() ?? step.eventName,
    visitors: step.visitors,
    conversionFromPrevious: step.conversionFromPrevious,
    dropOff: step.dropOff,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {m['admin.funnel.title']()}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {m['admin.funnel.description']()}
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">{m['admin.traffic.period']()}</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-3"
            value={days}
            onChange={(event) =>
              setDays(event.target.value as FunnelReport['days'])
            }
          >
            <option value="7">{m['admin.traffic.days_7']()}</option>
            <option value="30">{m['admin.traffic.days_30']()}</option>
            <option value="90">{m['admin.traffic.days_90']()}</option>
            <option value="all">{m['admin.traffic.all_time']()}</option>
          </select>
        </label>
      </header>

      {report.isError ? (
        <p role="status" className="text-destructive text-sm">
          {m['admin.funnel.error']()}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{m['admin.funnel.title']()}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : report.isError ? (
            <p className="text-muted-foreground text-sm">
              {m['admin.funnel.error']()}
            </p>
          ) : stages.every((stage) => stage.visitors === 0) ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {m['admin.funnel.empty']()}
            </p>
          ) : (
            <FunnelChart
              stages={stages}
              visitorsLabel={m['admin.funnel.visitors']()}
              conversionLabel={m['admin.funnel.conversion']()}
              dropOffLabel={m['admin.funnel.drop_off']()}
            />
          )}
        </CardContent>
      </Card>
      <AdminEmailRecall />
    </div>
  );
}
