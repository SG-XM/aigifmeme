import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link, usePathname } from '@/core/i18n/navigation';
import { stopRun, useRunningSessions } from '@/lib/agent-runs';
import { apiDelete, apiGet, apiPatch } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { useChatActions } from '@/components/agent/chat-actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

interface ChatItem {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
}

interface ChatListData {
  chats?: Array<{
    id: string;
    title: string;
    preview: string;
    updatedAt: string;
  }>;
  total?: number;
}

// Other views (the chat page after a turn completes, the rename dialog)
// fire this event so the sidebar refetches without threading a callback
// through props.
const CHATS_CHANGED_EVENT = 'uptown:chats-changed';

/** Recent chats shown inline; the rest live on /chats. */
const SIDEBAR_CHAT_LIMIT = 10;

export function notifyChatsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHATS_CHANGED_EVENT));
}

export function ChatsSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { openRename, openDelete, dialogs } = useChatActions();

  // Only the inline slice is fetched here; `total` tells us whether the
  // "more" entry is needed.
  const listQuery = useQuery({
    queryKey: ['agent-chats', 1, SIDEBAR_CHAT_LIMIT],
    queryFn: () =>
      apiGet<ChatListData>(
        `/api/agent/chats?page=1&pageSize=${SIDEBAR_CHAT_LIMIT}`
      ),
    enabled: !!session?.user,
  });

  const chats: ChatItem[] = useMemo(
    () =>
      (listQuery.data?.chats ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        preview: c.preview,
        updatedAt: new Date(c.updatedAt).getTime(),
      })),
    [listQuery.data]
  );

  useEffect(() => {
    const handler = () =>
      queryClient.invalidateQueries({ queryKey: ['agent-chats'] });
    window.addEventListener(CHATS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CHATS_CHANGED_EVENT, handler);
  }, [queryClient]);

  const derivedActiveId = pathname.match(/\/chat\/([^/]+)/)?.[1];
  const runningSessions = useRunningSessions();

  return (
    <Sidebar variant="inset" className="top-16 h-[calc(100dvh-4rem)]">
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 pt-2">
          <p className="text-sm font-medium">{m['navigation.history']()}</p>
          {isMobile && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpenMobile(false)}
              aria-label={m['navigation.close_history']()}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpenMobile(false);
        }}
      >
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/chat">
                  <SidebarMenuButton
                    tooltip={m['agent.nav.new_chat']()}
                    isActive={pathname.endsWith('/chat')}
                  >
                    <Plus />
                    <span>{m['agent.nav.new_chat']()}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/chats">
                  <SidebarMenuButton
                    tooltip={m['agent.nav.chats']()}
                    isActive={pathname.endsWith('/chats')}
                  >
                    <MessagesSquare />
                    <span>{m['agent.nav.chats']()}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{m['agent.chats.title']()}</SidebarGroupLabel>
          <SidebarGroupContent>
            {chats.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-muted-foreground text-xs">
                  {m['agent.chats.empty']()}
                </p>
              </div>
            ) : (
              <>
                <ChatList
                  items={chats}
                  activeId={derivedActiveId}
                  runningIds={runningSessions}
                  onRename={openRename}
                  onDelete={openDelete}
                />
                {(listQuery.data?.total ?? 0) > SIDEBAR_CHAT_LIMIT && (
                  <SidebarMenu>
                    <SidebarMenuItem>
                      {/* Everything past the inline slice lives on the
                          full chats page. */}
                      <Link href="/chats">
                        <SidebarMenuButton className="text-muted-foreground">
                          <MoreHorizontal />
                          <span>{m['agent.chats.view_all']()}</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  </SidebarMenu>
                )}
              </>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {dialogs}
    </Sidebar>
  );
}

function ChatList({
  items,
  activeId,
  runningIds,
  onRename,
  onDelete,
}: {
  items: ChatItem[];
  activeId?: string;
  runningIds: string[];
  onRename: (item: ChatItem) => void;
  onDelete: (item: ChatItem) => void;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const href = `/chat/${item.id}`;
        const isActive = activeId === item.id;
        const isRunning = runningIds.includes(item.id);
        return (
          <SidebarMenuItem key={item.id}>
            <Link href={href}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={isActive}
                className="pr-8"
              >
                <span className="truncate">{item.title}</span>
              </SidebarMenuButton>
            </Link>
            {/* The action slot is either/or: a spinner while the turn runs,
                the "…" menu once it's done. Renaming or deleting a chat
                mid-turn isn't something we want to invite. */}
            {isRunning ? (
              <span
                className="text-primary absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center"
                title={m['agent.chats.working']()}
              >
                <Loader2 className="size-3.5 animate-spin" />
              </span>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuAction
                      showOnHover
                      aria-label={m['agent.chats.more']()}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  <DropdownMenuItem onClick={() => onRename(item)}>
                    <Pencil className="size-4" />
                    {m['agent.chats.rename']()}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="size-4" />
                    {m['agent.chats.delete']()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
