import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Report = {
  enabled: boolean;
  total: number;
  clicked: number;
  checkouts: number;
  statuses: Record<string, number>;
  payments: { currency: string; people: number; amount: number }[];
  recent: {
    id: string;
    email: string;
    kind: string;
    locale: string;
    status: string;
  }[];
};
export function AdminEmailRecall() {
  const client = useQueryClient();
  const [userId, setUserId] = useState('');
  const report = useQuery({
    queryKey: ['admin-email-recall'],
    queryFn: () => apiGet<Report>('/api/admin/email-recall'),
  });
  const link = useMutation({
    mutationFn: () =>
      apiPost<{ url: string }>('/api/admin/email-recall', {
        action: 'link',
        userId,
        kind: 'checkout',
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin-email-recall'] }),
  });
  const data = report.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m['admin.recall.title']()}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {m['admin.recall.description']()}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">
          {data?.enabled
            ? m['admin.recall.enabled']()
            : m['admin.recall.disabled']()}
        </p>
        {report.isError ? (
          <p role="alert">{m['admin.funnel.error']()}</p>
        ) : null}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            [m['admin.recall.issued'](), data?.total],
            [m['admin.recall.sent'](), data?.statuses.sent],
            [m['admin.recall.clicked'](), data?.clicked],
            [m['admin.recall.checkouts'](), data?.checkouts],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{value ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          {m['admin.recall.payments']()}:{' '}
          {data?.payments.length
            ? data.payments
                .map(
                  (p) =>
                    new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: p.currency,
                    }).format(p.amount / 100) +
                    ' (' +
                    p.people +
                    ')'
                )
                .join(' · ')
            : '0'}
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            link.mutate();
          }}
        >
          <label className="flex-1 space-y-2 text-sm" htmlFor="recall-user-id">
            {m['admin.recall.user_id']()}
            <Input
              id="recall-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={link.isPending || !userId.trim()}>
            {m['admin.recall.generate']()}
          </Button>
        </form>
        {link.data ? (
          <Input
            aria-label={m['admin.recall.generated']()}
            readOnly
            value={link.data.url}
            onFocus={(e) => e.target.select()}
          />
        ) : null}
        {link.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {link.error.message}
          </p>
        ) : null}
        {data?.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">{m['admin.recall.recipient']()}</th>
                  <th className="p-2">{m['admin.recall.segment']()}</th>
                  <th className="p-2">{m['admin.recall.status']()}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">{row.email}</td>
                    <td className="p-2">
                      {row.kind === 'checkout'
                        ? m['admin.recall.checkout_segment']()
                        : m['admin.recall.paywall_segment']()}{' '}
                      · {row.locale}
                    </td>
                    <td className="p-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
