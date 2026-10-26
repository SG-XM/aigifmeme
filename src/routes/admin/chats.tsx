import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';

import { apiGet, pageQuery, type PageResult } from '@/lib/api-client';
import { isVideoUrl } from '@/lib/media';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { DataTable, type Column } from '@/components/data-table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface AdminChat {
  id: string;
  title: string;
  cover: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar: string;
  createdAt: string;
  updatedAt: string;
}

function ChatsPage() {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['admin-chats', page, search],
    queryFn: () =>
      apiGet<PageResult<AdminChat>>(
        pageQuery('/api/admin/chats', { page, pageSize, search })
      ),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminChat>[] = [
    {
      header: m['admin.chats.col_created'](),
      className: 'w-[160px]',
      cell: (row) => (
        <span className="text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      header: m['admin.chats.col_title'](),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {/* The chat's newest result, so a row is recognisable at a glance. */}
          {row.cover && (
            <button
              type="button"
              onClick={() => setZoom(row.cover)}
              title={m['agent.preview.open_video']()}
              className="bg-muted size-9 shrink-0 cursor-zoom-in overflow-hidden rounded-md"
            >
              {isVideoUrl(row.cover) ? (
                <video
                  src={row.cover}
                  muted
                  playsInline
                  preload="metadata"
                  className="pointer-events-none size-full object-cover"
                />
              ) : (
                <img
                  src={row.cover}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              )}
            </button>
          )}
          <span className="block max-w-[320px] truncate font-medium">
            {row.title}
          </span>
        </div>
      ),
    },
    {
      header: m['admin.chats.col_user'](),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarImage src={row.userAvatar || undefined} />
            <AvatarFallback className="text-xs">
              {(row.userName || row.userEmail || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span>{row.userName || '—'}</span>
            <span className="text-muted-foreground text-xs">
              {row.userEmail}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: m['admin.chats.col_updated'](),
      className: 'w-[160px]',
      cell: (row) => (
        <span className="text-muted-foreground">
          {formatDateTime(row.updatedAt)}
        </span>
      ),
    },
    {
      header: m['admin.chats.col_actions'](),
      className: 'w-[110px]',
      cell: (row) => (
        <a
          href={localizeHref(`/share/${row.id}`)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'gap-1.5'
          )}
        >
          <ExternalLink className="size-3.5" />
          {m['admin.chats.view']()}
        </a>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.chats.title']()}</h1>
        <p className="text-muted-foreground">
          {m['admin.chats.description']()}
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
            searchPlaceholder={m['admin.chats.search_placeholder']()}
            rowKey={(row) => row.id}
            onRefresh={() => query.refetch()}
            loading={query.isFetching}
          />
        </CardContent>
      </Card>

      <Dialog open={!!zoom} onOpenChange={(open) => !open && setZoom(null)}>
        <DialogContent className="max-h-[90dvh] overflow-auto p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">
            {m['agent.preview.media']()}
          </DialogTitle>
          {zoom &&
            (isVideoUrl(zoom) ? (
              <video
                src={zoom}
                controls
                playsInline
                preload="metadata"
                className="h-auto w-full rounded-md"
              />
            ) : (
              <img
                src={zoom}
                alt=""
                className="h-auto w-full rounded-md object-contain"
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute('/admin/chats')({
  component: ChatsPage,
});
