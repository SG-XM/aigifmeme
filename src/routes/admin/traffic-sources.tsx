import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BarChart3, MousePointerClick, Users } from 'lucide-react';

import { apiGet } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type TrafficSources = {
  days: string;
  registrations: number;
  attributedRegistrations: number;
  dimensions: Record<
    | 'source'
    | 'medium'
    | 'campaign'
    | 'term'
    | 'content'
    | 'referrer'
    | 'country',
    Array<{ value: string; registrations: number }>
  >;
};

const sections = [
  { key: 'source', label: () => m['admin.traffic.source']() },
  { key: 'medium', label: () => m['admin.traffic.medium']() },
  { key: 'campaign', label: () => m['admin.traffic.campaign']() },
  { key: 'term', label: () => m['admin.traffic.term']() },
  { key: 'content', label: () => m['admin.traffic.content']() },
  { key: 'referrer', label: () => m['admin.traffic.referrer']() },
  { key: 'country', label: () => m['admin.traffic.country']() },
] as const;

function getCountryLabel(
  countryCode: string,
  countryNames: Intl.DisplayNames
): string {
  if (!countryCode) return m['admin.traffic.unknown']();

  try {
    return countryNames.of(countryCode) || countryCode;
  } catch {
    // Older rows may contain country values that are not valid region codes.
    return countryCode;
  }
}

function TrafficSourcesPage() {
  const [days, setDays] = useState('30');
  const countryNames = new Intl.DisplayNames([getLocale()], { type: 'region' });
  const query = useQuery({
    queryKey: ['admin-traffic-sources', days],
    queryFn: () =>
      apiGet<TrafficSources>(`/api/admin/traffic-sources?days=${days}`),
  });
  const stats = query.data;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{m['admin.traffic.title']()}</h1>
          <p className="text-muted-foreground">
            {m['admin.traffic.description']()}
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">{m['admin.traffic.period']()}</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-3"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="7">{m['admin.traffic.days_7']()}</option>
            <option value="30">{m['admin.traffic.days_30']()}</option>
            <option value="90">{m['admin.traffic.days_90']()}</option>
            <option value="all">{m['admin.traffic.all_time']()}</option>
          </select>
        </label>
      </header>

      {query.isError ? (
        <p role="status" className="text-destructive text-sm">
          {m['admin.traffic.error']()}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {m['admin.traffic.registrations']()}
            </CardTitle>
            <Users className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {query.isError ? '—' : (stats?.registrations ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {m['admin.traffic.attributed']()}
            </CardTitle>
            <MousePointerClick className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {query.isError ? '—' : (stats?.attributedRegistrations ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => {
          const rows = stats?.dimensions[section.key] ?? [];
          return (
            <Card key={section.key}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="text-muted-foreground size-4" />
                  {section.label()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {query.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-5 w-3/5" />
                  </div>
                ) : rows.length ? (
                  <div className="space-y-3">
                    {rows.map((row) => (
                      <div
                        key={row.value}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="min-w-0 truncate" title={row.value}>
                          {section.key === 'country'
                            ? getCountryLabel(row.value, countryNames)
                            : row.value || m['admin.traffic.unknown']()}
                        </span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {row.registrations}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {m['admin.traffic.empty']()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/admin/traffic-sources')({
  component: TrafficSourcesPage,
});
