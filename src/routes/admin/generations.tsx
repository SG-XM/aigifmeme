import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';

import { apiGet, pageQuery, type PageResult } from '@/lib/api-client';
import { isVideoUrl } from '@/lib/media';
import { formatDateTime } from '@/lib/time';
import { m } from '@/paraglide/messages.js';
import { DataTable, type Column } from '@/components/data-table';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Generation {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  mediaType: string;
  provider: string;
  model: string;
  prompt: string;
  status: string;
  createdAt: string;
  costCredits: number;
  taskResult: string | null;
}

function resultUrls(taskResult: string | null): string[] {
  if (!taskResult) return [];
  try {
    const result = JSON.parse(taskResult) as Record<string, unknown>;
    const urls: string[] = [];
    if (Array.isArray(result.files)) {
      urls.push(
        ...result.files.filter(
          (value): value is string => typeof value === 'string'
        )
      );
    }
    for (const key of ['videos', 'images']) {
      if (!Array.isArray(result[key])) continue;
      for (const item of result[key]) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const url = record.videoUrl ?? record.imageUrl ?? record.url;
        if (typeof url === 'string') urls.push(url);
      }
    }
    return [...new Set(urls.filter((url) => /^https?:\/\//i.test(url)))];
  } catch {
    return [];
  }
}

function GenerationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ['admin-generations', page, debouncedSearch],
    queryFn: () =>
      apiGet<PageResult<Generation>>(
        pageQuery('/api/admin/generations', {
          page,
          pageSize,
          search: debouncedSearch,
        })
      ),
    placeholderData: keepPreviousData,
  });

  const columns: Column<Generation>[] = [
    {
      header: m['admin.generations.created'](),
      className: 'w-[155px]',
      cell: (row) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      header: m['admin.generations.user'](),
      cell: (row) => (
        <div className="flex min-w-[150px] flex-col">
          <span>{row.userName || '—'}</span>
          <span className="text-muted-foreground text-xs">{row.userEmail}</span>
        </div>
      ),
    },
    {
      header: m['admin.generations.prompt'](),
      cell: (row) => (
        <span className="block max-w-[300px] truncate" title={row.prompt}>
          {row.prompt || '—'}
        </span>
      ),
    },
    {
      header: m['admin.generations.model'](),
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.model}</span>
          <span className="text-muted-foreground text-xs">
            {row.provider} · {row.mediaType}
          </span>
        </div>
      ),
    },
    {
      header: m['admin.generations.status'](),
      cell: (row) => <span className="capitalize">{row.status}</span>,
    },
    {
      header: m['admin.generations.credits'](),
      className: 'w-[90px]',
      cell: (row) => row.costCredits,
    },
    {
      header: m['admin.generations.result'](),
      className: 'w-[110px]',
      cell: (row) => {
        const url = resultUrls(row.taskResult)[0];
        if (!url) return <span className="text-muted-foreground">—</span>;
        return (
          <button
            type="button"
            onClick={() => setPreview(url)}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <ExternalLink className="mr-1 size-3.5" />
            {m['admin.generations.preview']()}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.generations.title']()}</h1>
        <p className="text-muted-foreground">
          {m['admin.generations.description']()}
        </p>
      </div>
      <Card>
        <CardContent>
          <DataTable
            columns={columns}
            data={query.data?.items ?? []}
            total={query.data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder={m['admin.generations.search_placeholder']()}
            emptyText={m['admin.generations.empty']()}
            rowKey={(row) => row.id}
            onRefresh={() => query.refetch()}
            loading={query.isFetching}
          />
        </CardContent>
      </Card>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-auto p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">
            {m['admin.generations.preview']()}
          </DialogTitle>
          {preview &&
            (isVideoUrl(preview) ? (
              <video
                src={preview}
                controls
                playsInline
                preload="metadata"
                className="h-auto w-full rounded-md"
              />
            ) : (
              <img
                src={preview}
                alt=""
                className="h-auto w-full rounded-md object-contain"
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute('/admin/generations')({
  component: GenerationsPage,
});
