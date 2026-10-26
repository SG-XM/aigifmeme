import { useState, type ComponentType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Globe,
  Link as LinkIcon,
  Loader2,
  Lock,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';

import { apiGet, apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type Visibility = 'private' | 'public';

interface ShareState {
  visibility: Visibility;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // http:// dev fallback — the clipboard API needs a secure context.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    return Promise.resolve();
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Share popover for a conversation. Two visibility rows apply immediately on
 * click; once public, a footer button copies the /share/<id> link. Only public
 * chats are readable by others at that link — the share API enforces it
 * server-side.
 */
export function ChatShareMenu({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['chat-share', sessionId];

  const shareQuery = useQuery({
    queryKey,
    queryFn: () =>
      apiGet<ShareState>(
        `/api/agent/chat/${encodeURIComponent(sessionId)}/share`
      ),
    enabled: open,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (visibility: Visibility) =>
      apiPost<ShareState>(
        `/api/agent/chat/${encodeURIComponent(sessionId)}/share`,
        { visibility }
      ),
    // Optimistic checkmark — the row should respond instantly.
    onMutate: async (visibility) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ShareState>(queryKey);
      queryClient.setQueryData<ShareState>(queryKey, { visibility });
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error(error.message);
    },
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  const visibility = shareQuery.data?.visibility ?? 'private';

  async function copyLink() {
    try {
      await copyText(
        `${window.location.origin}${localizeHref(`/share/${sessionId}`)}`
      );
      toast.success(m['agent.share.link_copied']());
    } catch {
      toast.error(m['agent.share.copy_failed']());
    }
  }

  const options: Array<{
    value: Visibility;
    icon: ComponentType<{ className?: string }>;
    title: string;
    description: string;
  }> = [
    {
      value: 'private',
      icon: Lock,
      title: m['agent.share.only_me'](),
      description: m['agent.share.only_me_desc'](),
    },
    {
      value: 'public',
      icon: Globe,
      title: m['agent.share.public'](),
      description: m['agent.share.public_desc'](),
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m['agent.share.button']()}
            title={m['agent.share.button']()}
            className="text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-md"
          />
        }
      >
        <Share2 className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 rounded-xl p-2">
        {options.map((option) => {
          const selected = visibility === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              disabled={mutation.isPending || shareQuery.isPending}
              aria-pressed={selected}
              onClick={() => {
                if (!selected) mutation.mutate(option.value);
              }}
              className="hover:bg-accent flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors disabled:cursor-default disabled:opacity-60"
            >
              <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block text-sm font-medium">
                  {option.title}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {option.description}
                </span>
              </span>
              <Check
                className={cn(
                  'text-foreground size-4 shrink-0 transition-opacity',
                  selected ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          );
        })}
        {/* Nothing to copy while it's private — flip the row first. */}
        {visibility === 'public' && (
          <Button
            type="button"
            onClick={copyLink}
            className="mt-2 w-full gap-2 rounded-full"
          >
            {shareQuery.isPending || mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LinkIcon className="size-4" />
            )}
            {m['agent.share.copy_link']()}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
