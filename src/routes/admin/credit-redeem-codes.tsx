import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Ban, Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { tDynamic } from '@/core/i18n/dynamic';
import { apiGet, apiPatch, apiPost, type PageResult } from '@/lib/api-client';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { DataTable, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Tab =
  | 'all'
  | 'available'
  | 'sending'
  | 'sent'
  | 'redeemed'
  | 'expired'
  | 'invalidated';
const TABS: Tab[] = [
  'all',
  'available',
  'sending',
  'sent',
  'redeemed',
  'expired',
  'invalidated',
];
const PAGE_SIZE = 20;

interface CodeRow {
  id: string;
  code: string;
  credits: number;
  note: string;
  expiresAt: string;
  createdAt: string;
  sentToEmail: string | null;
  sentAt: string | null;
  sendReservedAt: string | null;
  invalidatedAt: string | null;
  redeemedAt: string | null;
  redeemedEmail: string | null;
}

const createSchema = z.object({
  count: z.coerce.number().int().min(1).max(1000),
  credits: z.coerce.number().int().min(1),
  expiresAt: z.string().min(1),
  note: z.string(),
});
type CreateValues = z.input<typeof createSchema>;

function defaultExpiry() {
  const value = new Date();
  value.setDate(value.getDate() + 30);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function getCodeStatus(row: CodeRow): Tab {
  if (row.invalidatedAt) return 'invalidated';
  if (row.redeemedAt) return 'redeemed';
  if (new Date(row.expiresAt).getTime() <= Date.now()) return 'expired';
  if (row.sentAt) return 'sent';
  if (row.sendReservedAt) return 'sending';
  return 'available';
}

function CreditRedeemCodesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [invalidating, setInvalidating] = useState<CodeRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [tab, debouncedSearch]);

  const listQuery = useQuery({
    queryKey: ['admin-credit-redeem-codes', page, tab, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (tab !== 'all') params.set('status', tab);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return apiGet<PageResult<CodeRow>>(
        `/api/admin/credit-redeem-codes?${params}`
      );
    },
    placeholderData: keepPreviousData,
  });

  const createForm = useForm({
    defaultValues: {
      count: '25',
      credits: '5',
      expiresAt: defaultExpiry(),
      note: '',
    } as CreateValues,
    validators: { onSubmit: createSchema },
    onSubmit: async ({ value }) => {
      const expiresAt = new Date(value.expiresAt);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
        toast.error(m['admin.credit_redeem_codes.expiry_future']());
        return;
      }
      await createMutation.mutateAsync({
        count: Number(value.count),
        credits: Number(value.credits),
        expiresAt: expiresAt.toISOString(),
        note: value.note.trim(),
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      count: number;
      credits: number;
      expiresAt: string;
      note: string;
    }) => apiPost('/api/admin/credit-redeem-codes', body),
    onSuccess: () => {
      toast.success(m['admin.credit_redeem_codes.create_success']());
      setCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({
        queryKey: ['admin-credit-redeem-codes'],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invalidateMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch('/api/admin/credit-redeem-codes', { id }),
    onSuccess: () => {
      toast.success(m['admin.credit_redeem_codes.invalidate_success']());
      setInvalidating(null);
      queryClient.invalidateQueries({
        queryKey: ['admin-credit-redeem-codes'],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(
      () => toast.success(m['admin.credit_redeem_codes.copied']()),
      () => toast.error(m['admin.credit_redeem_codes.copy_failed']())
    );
  }

  const columns: Column<CodeRow>[] = [
    {
      header: m['admin.credit_redeem_codes.code'](),
      cell: (row) => (
        <div className="flex items-center gap-1">
          <code className="font-mono text-xs">{row.code}</code>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => copyCode(row.code)}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      ),
    },
    {
      header: m['admin.credit_redeem_codes.credits'](),
      cell: (row) => row.credits,
    },
    {
      header: m['admin.credit_redeem_codes.status'](),
      cell: (row) =>
        tDynamic(`admin.credit_redeem_codes.status_${getCodeStatus(row)}`),
    },
    {
      header: m['admin.credit_redeem_codes.sent_to'](),
      cell: (row) => row.sentToEmail || '—',
    },
    {
      header: m['admin.credit_redeem_codes.redeemed_email'](),
      cell: (row) => row.redeemedEmail || '—',
    },
    {
      header: m['admin.credit_redeem_codes.expires'](),
      cell: (row) => formatDateTime(row.expiresAt),
    },
    {
      header: m['admin.credit_redeem_codes.actions'](),
      className: 'w-[72px]',
      cell: (row) =>
        getCodeStatus(row) === 'available' || getCodeStatus(row) === 'sent' ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setInvalidating(row)}
          >
            <Ban className="text-destructive size-4" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {m['admin.credit_redeem_codes.title']()}
          </h1>
          <p className="text-muted-foreground">
            {m['admin.credit_redeem_codes.description']()}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          {m['admin.credit_redeem_codes.create_button']()}
        </Button>
      </div>

      <div className="border-border flex gap-1 overflow-x-auto border-b">
        {TABS.map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              tab === value
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {tDynamic(`admin.credit_redeem_codes.tab_${value}`)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent>
          <DataTable
            columns={columns}
            data={listQuery.data?.items ?? []}
            total={listQuery.data?.total ?? 0}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            rowKey={(row) => row.id}
            emptyText={m['admin.credit_redeem_codes.empty']()}
            search={search}
            onSearchChange={setSearch}
            onRefresh={() => listQuery.refetch()}
            loading={listQuery.isFetching}
          />
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createForm.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {m['admin.credit_redeem_codes.create_title']()}
            </DialogTitle>
            <DialogDescription>
              {m['admin.credit_redeem_codes.create_description']()}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              createForm.handleSubmit();
            }}
          >
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <createForm.Field name="count">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label>{m['admin.credit_redeem_codes.count']()}</Label>
                      <Input
                        type="number"
                        min="1"
                        max="1000"
                        value={String(field.state.value)}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </div>
                  )}
                </createForm.Field>
                <createForm.Field name="credits">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label>{m['admin.credit_redeem_codes.credits']()}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={String(field.state.value)}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </div>
                  )}
                </createForm.Field>
              </div>
              <createForm.Field name="expiresAt">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label>{m['admin.credit_redeem_codes.expires']()}</Label>
                    <Input
                      type="datetime-local"
                      value={String(field.state.value)}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              </createForm.Field>
              <createForm.Field name="note">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label>{m['admin.credit_redeem_codes.note']()}</Label>
                    <Input
                      value={String(field.state.value)}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              </createForm.Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {m['admin.credit_redeem_codes.cancel']()}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? m['admin.credit_redeem_codes.creating']()
                  : m['admin.credit_redeem_codes.create_submit']()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!invalidating}
        onOpenChange={(open) => !open && setInvalidating(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {m['admin.credit_redeem_codes.invalidate_title']()}
            </DialogTitle>
            <DialogDescription>
              {m['admin.credit_redeem_codes.invalidate_description']()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvalidating(null)}>
              {m['admin.credit_redeem_codes.cancel']()}
            </Button>
            <Button
              variant="destructive"
              disabled={invalidateMutation.isPending}
              onClick={() =>
                invalidating && invalidateMutation.mutate(invalidating.id)
              }
            >
              {m['admin.credit_redeem_codes.invalidate_confirm']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute('/admin/credit-redeem-codes')({
  component: CreditRedeemCodesPage,
});
