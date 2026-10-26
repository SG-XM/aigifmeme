import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  abExperimentInput,
  type ABExperimentSummary,
  type ABGroupStats,
} from '@/lib/ab-tests';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import {
  FunnelChart,
  type FunnelChartStage,
} from '@/components/admin/funnel-chart';
import { TextField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const draftSchema = abExperimentInput.extend({
  bPercent: z
    .string()
    .regex(/^\d+$/)
    .refine((s) => Number(s) >= 1 && Number(s) <= 99),
  windowDays: z
    .string()
    .regex(/^\d+$/)
    .refine((s) => Number(s) >= 1 && Number(s) <= 90),
});
const defaults = {
  key: '',
  name: '',
  scene: '',
  productScope: 'subscription' as 'subscription' | 'topup' | 'any',
  bPercent: '50',
  windowDays: '7',
};

function GroupResults({ groups }: { groups: ABGroupStats[] }) {
  const percent = (value: number | null) =>
    value === null ? '—' : `${(value * 100).toFixed(2)}%`;
  const metrics: {
    label: string;
    render: (g: ABGroupStats) => string | number;
  }[] = [
    { label: m['admin.ab.participants'](), render: (g) => g.participants },
    { label: m['admin.ab.checkout_users'](), render: (g) => g.checkoutUsers },
    { label: m['admin.ab.payers'](), render: (g) => g.payers },
    { label: m['admin.ab.paid_orders'](), render: (g) => g.paidOrders },
    {
      label: m['admin.ab.conversion'](),
      render: (g) => percent(g.conversionRate),
    },
    {
      label: m['admin.ab.mature_participants'](),
      render: (g) => g.matureParticipants,
    },
    {
      label: m['admin.ab.mature_conversion'](),
      render: (g) => percent(g.matureConversionRate),
    },
  ];
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      amount / 100
    );
  if (groups.some((g) => g.visitorFunnel)) {
    metrics.splice(
      1,
      0,
      {
        label: m['admin.ab.photo_selected'](),
        render: (g) => g.visitorFunnel?.photoSelected ?? 0,
      },
      {
        label: m['admin.ab.login_prompts'](),
        render: (g) => g.visitorFunnel?.loginPrompts ?? 0,
      },
      {
        label: m['admin.ab.submits'](),
        render: (g) => g.visitorFunnel?.submits ?? 0,
      },
      {
        label: m['admin.ab.authenticated'](),
        render: (g) => g.visitorFunnel?.authenticated ?? 0,
      },
      {
        label: m['admin.ab.login_conversion'](),
        render: (g) => percent(g.visitorFunnel?.loginConversionRate ?? 0),
      },
      {
        label: m['admin.ab.generations'](),
        render: (g) => g.visitorFunnel?.generations ?? 0,
      }
    );
  }
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3 text-left">{m['admin.ab.metric']()}</th>
              {groups.map((g) => (
                <th className="p-3 text-right" key={g.variant}>
                  {g.variant}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr className="border-b" key={metric.label}>
                <td className="p-3">{metric.label}</td>
                {groups.map((g) => (
                  <td className="p-3 text-right tabular-nums" key={g.variant}>
                    {metric.render(g)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groups.some((g) => g.funnel) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const counts = [
              g.funnel?.photoSelected ?? 0,
              g.funnel?.authenticated ?? 0,
              g.funnel?.paywallShown ?? g.participants,
              g.funnel?.checkouts ?? g.checkoutUsers,
              g.funnel?.payers ?? g.payers,
            ];
            const labels = [
              m['admin.funnel.photo'](),
              m['admin.funnel.login'](),
              m['admin.funnel.paywall'](),
              m['admin.funnel.checkout'](),
              m['admin.funnel.payment'](),
            ];
            let previous: number | null = null;
            const stages: FunnelChartStage[] = counts.map((visitors, index) => {
              const dropOff =
                previous === null ? null : Math.max(0, previous - visitors);
              const conversionFromPrevious =
                previous === null || previous === 0
                  ? null
                  : visitors / previous;
              previous = visitors;
              return {
                label: labels[index],
                visitors,
                conversionFromPrevious,
                dropOff,
              };
            });
            return (
              <Card key={g.variant}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {m['admin.funnel.experiment']()} · {g.variant}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FunnelChart
                    stages={stages}
                    visitorsLabel={m['admin.funnel.visitors']()}
                    conversionLabel={m['admin.funnel.conversion']()}
                    dropOffLabel={m['admin.funnel.drop_off']()}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div className="space-y-2 rounded-lg border p-4" key={g.variant}>
            <p className="font-medium">
              {g.variant} · {m['admin.ab.revenue']()}
            </p>
            {!g.revenue.length && (
              <p className="text-muted-foreground text-sm">
                {m['admin.ab.no_revenue']()}
              </p>
            )}
            {g.revenue.map((r) => (
              <div className="space-y-1 text-sm" key={r.currency}>
                <p>
                  {r.currency}: {money(r.amount, r.currency)}
                </p>
                <p className="text-muted-foreground">
                  {m['admin.ab.per_user']()}: {money(r.perUser, r.currency)} ·{' '}
                  {m['admin.ab.average_order']()}:{' '}
                  {money(r.averageOrder, r.currency)}
                </p>
              </div>
            ))}
            {g.missingAmounts > 0 && (
              <p className="text-destructive text-sm">
                {m['admin.ab.missing_amounts']({ count: g.missingAmounts })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminABTests() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin-ab-tests'],
    queryFn: () =>
      apiGet<Omit<ABExperimentSummary, 'groups'>[]>('/api/admin/ab-tests'),
  });
  const report = useQuery({
    queryKey: ['admin-ab-report', selectedId],
    queryFn: () =>
      apiGet<ABExperimentSummary>(
        `/api/admin/ab-tests?id=${encodeURIComponent(selectedId!)}`
      ),
    enabled: !!selectedId,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['admin-ab-tests'] });
    void client.invalidateQueries({ queryKey: ['admin-ab-report'] });
  };
  const create = useMutation({
    mutationFn: (input: Parameters<typeof abExperimentInput.parse>[0]) =>
      apiPost<{ id: string }>('/api/admin/ab-tests', input),
    onSuccess: ({ id }) => {
      form.reset();
      setSelectedId(id);
      refresh();
      toast.success(m['admin.ab.created']());
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const transition = useMutation({
    mutationFn: (input: { id: string; action: 'start' | 'stop' }) =>
      apiPatch('/api/admin/ab-tests', input),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: draftSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync({
        ...value,
        bPercent: Number(value.bPercent),
        windowDays: Number(value.windowDays),
      });
    },
  });
  const statusText = (status: string) =>
    status === 'running'
      ? m['admin.ab.running']()
      : status === 'stopped'
        ? m['admin.ab.stopped']()
        : m['admin.ab.draft']();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {m['admin.ab.title']()}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {m['admin.ab.description']()}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{m['admin.ab.create']()}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <form.Field name="name">
                {(field) => (
                  <TextField
                    field={field}
                    label={m['admin.ab.name']()}
                    required
                  />
                )}
              </form.Field>
              <form.Field name="key">
                {(field) => (
                  <TextField
                    field={field}
                    label={m['admin.ab.key']()}
                    placeholder="pricing-layout-v1"
                    required
                  />
                )}
              </form.Field>
              <form.Field name="scene">
                {(field) => (
                  <TextField
                    field={field}
                    label={m['admin.ab.scene']()}
                    placeholder="pricing"
                    required
                  />
                )}
              </form.Field>
              <form.Field name="bPercent">
                {(field) => (
                  <TextField
                    field={field}
                    label={m['admin.ab.b_percent']()}
                    type="number"
                    required
                  />
                )}
              </form.Field>
              <form.Field name="windowDays">
                {(field) => (
                  <TextField
                    field={field}
                    label={m['admin.ab.window_days']()}
                    type="number"
                    required
                  />
                )}
              </form.Field>
              <form.Field name="productScope">
                {(field) => (
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">{m['admin.ab.scope']()}</span>
                    <select
                      className="border-input bg-background h-9 w-full rounded-md border px-3"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value as 'subscription' | 'topup' | 'any'
                        )
                      }
                    >
                      <option value="subscription">
                        {m['admin.ab.subscription']()}
                      </option>
                      <option value="topup">{m['admin.ab.topup']()}</option>
                      <option value="any">{m['admin.ab.any']()}</option>
                    </select>
                  </label>
                )}
              </form.Field>
            </div>
            <p className="text-muted-foreground text-sm">
              {m['admin.ab.integration_note']()}
            </p>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(pending) => (
                <Button type="submit" disabled={pending}>
                  {m['admin.ab.create']()}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
      {list.isError && (
        <p className="text-destructive">
          {m['admin.ab.load_failed']()}{' '}
          <Button variant="outline" onClick={() => void list.refetch()}>
            {m['admin.ab.refresh']()}
          </Button>
        </p>
      )}
      <div className="space-y-3">
        {list.data?.map((experiment) => (
          <Card key={experiment.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">
                  {experiment.name}{' '}
                  <Badge variant="secondary">
                    {statusText(experiment.status)}
                  </Badge>
                </p>
                <p className="text-muted-foreground text-sm">
                  {experiment.key} · {experiment.scene} · A{' '}
                  {100 - experiment.bPercent}% / B {experiment.bPercent}%
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedId(experiment.id)}
                >
                  {m['admin.ab.results']()}
                </Button>
                {experiment.status !== 'stopped' && (
                  <Button
                    variant={
                      experiment.status === 'running' ? 'outline' : 'default'
                    }
                    disabled={transition.isPending}
                    onClick={() =>
                      transition.mutate({
                        id: experiment.id,
                        action:
                          experiment.status === 'running' ? 'stop' : 'start',
                      })
                    }
                  >
                    {experiment.status === 'running'
                      ? m['admin.ab.stop']()
                      : m['admin.ab.start']()}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!list.isPending && list.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">{m['admin.ab.empty']()}</p>
      )}
      {selectedId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {report.data?.name ?? m['admin.ab.results']()}
            </CardTitle>
            <Button
              variant="outline"
              disabled={report.isFetching}
              onClick={() => void report.refetch()}
            >
              {m['admin.ab.refresh']()}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {m['admin.ab.stats_note']()}
            </p>
            {report.isError ? (
              <p className="text-destructive">{m['admin.ab.load_failed']()}</p>
            ) : report.data ? (
              <GroupResults groups={report.data.groups} />
            ) : (
              <p>{m['admin.ab.loading']()}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
