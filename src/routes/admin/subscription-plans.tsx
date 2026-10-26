import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Plan = {
  productId: string;
  nameEn: string;
  nameZh: string;
  nameEs: string;
  descriptionEn: string;
  descriptionZh: string;
  descriptionEs: string;
  featuresEn: string;
  featuresZh: string;
  featuresEs: string;
  badgeEn: string;
  badgeZh: string;
  badgeEs: string;
  priceInCents: number;
  compareAtPriceInCents: number | null;
  currency: string;
  interval: 'month' | 'year';
  intervalCount: number;
  credits: number;
  creditsValidDays: number;
  featured: boolean;
  enabled: boolean;
  sort: number;
};

type PlanDraft = Omit<
  Plan,
  | 'priceInCents'
  | 'compareAtPriceInCents'
  | 'intervalCount'
  | 'credits'
  | 'creditsValidDays'
  | 'sort'
> & {
  priceDollars: string;
  compareAtPriceDollars: string;
  intervalCount: string;
  credits: string;
  creditsValidDays: string;
  sort: string;
};

function toDraft(plan?: Plan): PlanDraft {
  return {
    productId: plan?.productId ?? '',
    nameEn: plan?.nameEn ?? '',
    nameZh: plan?.nameZh ?? '',
    nameEs: plan?.nameEs ?? '',
    descriptionEn: plan?.descriptionEn ?? '',
    descriptionZh: plan?.descriptionZh ?? '',
    descriptionEs: plan?.descriptionEs ?? '',
    featuresEn: plan?.featuresEn ?? '',
    featuresZh: plan?.featuresZh ?? '',
    featuresEs: plan?.featuresEs ?? '',
    badgeEn: plan?.badgeEn ?? '',
    badgeZh: plan?.badgeZh ?? '',
    badgeEs: plan?.badgeEs ?? '',
    priceDollars: ((plan?.priceInCents ?? 2990) / 100).toFixed(2),
    compareAtPriceDollars: plan?.compareAtPriceInCents
      ? (plan.compareAtPriceInCents / 100).toFixed(2)
      : '',
    currency: 'usd',
    interval: plan?.interval ?? 'month',
    intervalCount: String(plan?.intervalCount ?? 1),
    credits: String(plan?.credits ?? 100),
    creditsValidDays: String(plan?.creditsValidDays ?? 31),
    featured: plan?.featured ?? false,
    enabled: plan?.enabled ?? true,
    sort: String(plan?.sort ?? 0),
  };
}

function toPayload(draft: PlanDraft) {
  return {
    ...draft,
    productId: draft.productId.trim(),
    nameEn: draft.nameEn.trim(),
    nameZh: draft.nameZh.trim(),
    nameEs: draft.nameEs.trim(),
    descriptionEn: draft.descriptionEn.trim(),
    descriptionZh: draft.descriptionZh.trim(),
    descriptionEs: draft.descriptionEs.trim(),
    featuresEn: draft.featuresEn.trim(),
    featuresZh: draft.featuresZh.trim(),
    featuresEs: draft.featuresEs.trim(),
    badgeEn: draft.badgeEn.trim(),
    badgeZh: draft.badgeZh.trim(),
    badgeEs: draft.badgeEs.trim(),
    priceInCents: Math.round(Number(draft.priceDollars) * 100),
    compareAtPriceInCents: draft.compareAtPriceDollars.trim()
      ? Math.round(Number(draft.compareAtPriceDollars) * 100)
      : null,
    intervalCount: Number(draft.intervalCount),
    credits: Number(draft.credits),
    creditsValidDays: Number(draft.creditsValidDays),
    sort: Number(draft.sort),
  };
}

function PlanFields({
  draft,
  setDraft,
  isNew = false,
}: {
  draft: PlanDraft;
  setDraft: Dispatch<SetStateAction<PlanDraft>>;
  isNew?: boolean;
}) {
  const fields: Array<[keyof PlanDraft, string, 'text' | 'number']> = [
    ['productId', m['admin.subscription_plans.product_id'](), 'text'],
    ['nameEn', m['admin.subscription_plans.name_en'](), 'text'],
    ['nameZh', m['admin.subscription_plans.name_zh'](), 'text'],
    ['nameEs', m['admin.subscription_plans.name_es'](), 'text'],
    ['priceDollars', m['admin.subscription_plans.price'](), 'number'],
    [
      'compareAtPriceDollars',
      m['admin.subscription_plans.original_price'](),
      'number',
    ],
    ['intervalCount', m['admin.subscription_plans.interval_count'](), 'number'],
    ['credits', m['admin.subscription_plans.credits'](), 'number'],
    ['creditsValidDays', m['admin.subscription_plans.valid_days'](), 'number'],
    ['sort', m['admin.subscription_plans.sort'](), 'number'],
  ];

  const setText = (key: keyof PlanDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(([key, label, type]) => (
          <label className="space-y-1 text-sm" key={key}>
            <span className="text-muted-foreground">{label}</span>
            <Input
              type={type}
              min={type === 'number' ? 0 : undefined}
              step={
                key === 'priceDollars' || key === 'compareAtPriceDollars'
                  ? '0.01'
                  : type === 'number'
                    ? '1'
                    : undefined
              }
              value={String(draft[key])}
              disabled={key === 'productId' && !isNew}
              onChange={(event) => setText(key, event.target.value)}
            />
          </label>
        ))}
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">
            {m['admin.subscription_plans.interval']()}
          </span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={draft.interval}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                interval: event.target.value as PlanDraft['interval'],
              }))
            }
          >
            <option value="month">
              {m['admin.subscription_plans.month']()}
            </option>
            <option value="year">{m['admin.subscription_plans.year']()}</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(
          [
            ['descriptionEn', m['admin.subscription_plans.description_en']()],
            ['descriptionZh', m['admin.subscription_plans.description_zh']()],
            ['descriptionEs', m['admin.subscription_plans.description_es']()],
            ['featuresEn', m['admin.subscription_plans.features_en']()],
            ['featuresZh', m['admin.subscription_plans.features_zh']()],
            ['featuresEs', m['admin.subscription_plans.features_es']()],
            ['badgeEn', m['admin.subscription_plans.badge_en']()],
            ['badgeZh', m['admin.subscription_plans.badge_zh']()],
            ['badgeEs', m['admin.subscription_plans.badge_es']()],
          ] as Array<[keyof PlanDraft, string]>
        ).map(([key, label]) => (
          <label className="space-y-1 text-sm" key={key}>
            <span className="text-muted-foreground">{label}</span>
            <textarea
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              value={String(draft[key])}
              rows={key.startsWith('features') ? 4 : 2}
              onChange={(event) => setText(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.featured}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                featured: event.target.checked,
              }))
            }
          />
          {m['admin.subscription_plans.featured']()}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          {m['admin.subscription_plans.enabled']()}
        </label>
      </div>
    </div>
  );
}

function PlanEditor({
  plan,
  saving,
  onSave,
}: {
  plan: Plan;
  saving: boolean;
  onSave: (payload: ReturnType<typeof toPayload>) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(plan));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {plan.nameEn} · {plan.productId}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {m['admin.subscription_plans.preview']({
            price: `$${(plan.priceInCents / 100).toFixed(2)}`,
            period:
              plan.interval === 'month'
                ? m['admin.subscription_plans.month']()
                : m['admin.subscription_plans.year'](),
            credits: plan.credits,
          })}
        </p>
        <PlanFields draft={draft} setDraft={setDraft} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">USD</span>
          <Button disabled={saving} onClick={() => onSave(toPayload(draft))}>
            {m['admin.subscription_plans.save']()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionPlansPage() {
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [createDraft, setCreateDraft] = useState(() => toDraft());
  const query = useQuery({
    queryKey: ['admin-subscription-plans'],
    queryFn: () => apiGet<Plan[]>('/api/admin/subscription-plans'),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-subscription-plans'] });
    queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
  };
  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      apiPatch('/api/admin/subscription-plans', payload),
    onSuccess: () => {
      toast.success(m['admin.subscription_plans.saved']());
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      apiPost('/api/admin/subscription-plans', payload),
    onSuccess: () => {
      toast.success(m['admin.subscription_plans.created']());
      setCreateDraft(toDraft());
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {m['admin.subscription_plans.title']()}
        </h1>
        <p className="text-muted-foreground">
          {m['admin.subscription_plans.description_page']()}
        </p>
      </div>
      <p className="bg-muted rounded-lg p-4 text-sm">
        {m['admin.subscription_plans.billing_policy']()}
      </p>
      <div className="flex gap-2">
        {(['month', 'year'] as const).map((value) => (
          <Button
            key={value}
            variant={interval === value ? 'default' : 'outline'}
            onClick={() => setInterval(value)}
          >
            {value === 'month'
              ? m['admin.subscription_plans.month']()
              : m['admin.subscription_plans.year']()}
          </Button>
        ))}
      </div>
      {query.isError && (
        <p role="alert" className="text-destructive">
          {m['admin.pricing.load_error']()}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{m['admin.subscription_plans.add']()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlanFields draft={createDraft} setDraft={setCreateDraft} isNew />
          <div className="flex justify-end">
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate(toPayload(createDraft))}
            >
              {m['admin.subscription_plans.create']()}
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {(query.data ?? [])
          .filter((plan) => plan.interval === interval)
          .map((plan) => (
            <PlanEditor
              key={`${plan.productId}:${JSON.stringify(plan)}`}
              plan={plan}
              saving={saveMutation.isPending}
              onSave={(payload) => saveMutation.mutate(payload)}
            />
          ))}
        {!query.isPending && !query.data?.length && (
          <p className="text-muted-foreground text-sm">
            {m['admin.subscription_plans.empty']()}
          </p>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/admin/subscription-plans')({
  component: SubscriptionPlansPage,
});
