import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

import { useRouter } from '@/core/i18n/navigation';
import { useRunningSessions } from '@/lib/agent-runs';
import { apiGet } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { useAgentHeader } from '@/components/agent/agent-header-context';
import { useChatActions } from '@/components/agent/chat-actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const Route = createFileRoute('/(agent)/chats')({
  component: ChatsPage,
});

interface ChatRow {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
}

interface ChatListData {
  chats?: ChatRow[];
  total?: number;
}

const PAGE_SIZE = 20;

/**
 * Every conversation — the sidebar only keeps the ten most recent. Paged
 * server-side, since building each row's preview costs a query.
 */
function ChatsPage() {
  const router = useRouter();
  const { setContent: setHeaderContent } = useAgentHeader();
  const { openRename, openDelete, dialogs } = useChatActions();
  const runningSessions = useRunningSessions();
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    queryKey: ['agent-chats', page, PAGE_SIZE],
    queryFn: () =>
      apiGet<ChatListData>(
        `/api/agent/chats?page=${page}&pageSize=${PAGE_SIZE}`
      ),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    setHeaderContent({ title: m['agent.chats.all_title']() });
    return () => setHeaderContent({});
  }, [setHeaderContent]);

  const chats = listQuery.data?.chats ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Deleting the last row of the last page would otherwise strand the user on
  // an empty page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        {listQuery.isLoading ? (
          <ChatsState text={m['agent.chats.loading']()} />
        ) : chats.length === 0 ? (
          <ChatsState text={m['agent.chats.empty']()} />
        ) : (
          <ul className="divide-border border-border divide-y overflow-hidden rounded-lg border">
            {chats.map((chat) => (
              <li
                key={chat.id}
                className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/chat/${chat.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {chat.title}
                    </span>
                    {runningSessions.includes(chat.id) && (
                      <Loader2
                        className="text-primary size-3.5 shrink-0 animate-spin"
                        aria-label={m['agent.chats.working']()}
                      />
                    )}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                    {chat.preview}
                  </span>
                </button>
                <time
                  className="text-muted-foreground shrink-0 text-xs"
                  dateTime={chat.updatedAt}
                >
                  {formatUpdatedAt(chat.updatedAt)}
                </time>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={m['agent.chats.more']()}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openRename(chat)}>
                      <Pencil className="size-4" />
                      {m['agent.chats.rename']()}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => openDelete(chat)}
                    >
                      <Trash2 className="size-4" />
                      {m['agent.chats.delete']()}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {m['agent.chats.page_of']({ page, pageCount })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" />
                {m['agent.chats.previous_page']()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
              >
                {m['agent.chats.next_page']()}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      {dialogs}
    </div>
  );
}

/** Time of day for today, a date for anything older. */
function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString();
}

function ChatsState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
      <div className="border-border bg-muted/40 flex size-12 items-center justify-center rounded-lg border">
        <MessageSquare className="text-muted-foreground size-5" />
      </div>
      <p className="mt-3 text-sm font-medium">{text}</p>
    </div>
  );
}
