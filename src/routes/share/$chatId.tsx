import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Images, Sparkles } from 'lucide-react';

import { Link, useRouter } from '@/core/i18n/navigation';
import { storedToMessages, type ChatHistoryData } from '@/lib/agent-chat';
import { apiGet } from '@/lib/api-client';
import { mediaNameFromUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import {
  ChatTranscript,
  useTranscriptImages,
} from '@/components/agent/chat-transcript';
import { PreviewPane } from '@/components/agent/preview-pane';
import {
  PreviewPaneProvider,
  usePreviewPane,
} from '@/components/agent/preview-pane-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { SidebarProvider } from '@/components/ui/sidebar';

export const Route = createFileRoute('/share/$chatId')({
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: SharedChatRoute,
});

interface SharedChat extends ChatHistoryData {
  chat?: {
    id: string;
    title: string;
    owner?: string;
    updatedAt: string;
  } | null;
}

/**
 * Read-only view of any conversation, for admins reviewing what users produce.
 * Same shell and transcript as the live chat page — the composer and the chats
 * sidebar are simply absent. Anyone without `admin.*` is sent to their own chat.
 */
function SharedChatRoute() {
  // Access is the API's call: public chats are readable by anyone with the
  // link, private ones only by their owner or an admin. The preview pane reads
  // the sidebar state to make room for itself; there's no sidebar here, but
  // its provider still has to exist.
  return (
    <PreviewPaneProvider>
      <SidebarProvider className="bg-sidebar h-dvh min-h-0 overflow-hidden">
        <SharedChatView />
        <PreviewPane />
      </SidebarProvider>
    </PreviewPaneProvider>
  );
}

function SharedChatView() {
  const { chatId } = Route.useParams();
  const router = useRouter();
  const redirected = useRef(false);
  const {
    open: previewOpen,
    setOpen,
    clearMedia,
    setImages,
  } = usePreviewPane();

  const chatQuery = useQuery({
    queryKey: ['share-chat', chatId],
    queryFn: () =>
      apiGet<SharedChat>(`/api/share/${encodeURIComponent(chatId)}`),
  });

  const messages = chatQuery.data?.messages
    ? storedToMessages(chatQuery.data.messages)
    : [];
  const { attachedImages, surfacedSrcs, previewImages } = useTranscriptImages(
    messages,
    chatId
  );

  useEffect(() => {
    setImages(
      previewImages.map((img) => ({
        src: img.src,
        alt: img.alt,
        name: mediaNameFromUrl(img.src) || img.alt,
      }))
    );
    return () => setImages([]);
  }, [previewImages, setImages]);

  // Private, deleted, or never existed — the API answers the same either way,
  // and there's nothing to show, so don't park the viewer on an error page.
  useEffect(() => {
    if (!chatQuery.isError || redirected.current) return;
    redirected.current = true;
    router.replace('/chat');
  }, [chatQuery.isError, router]);

  const chat = chatQuery.data?.chat;

  return (
    // Mirrors SidebarInset's inset variant — no <Sidebar> here to trigger it.
    <main className="bg-background m-2 flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span className="truncate text-sm font-medium">
          {chat?.title || m['admin.chats.title']()}
        </span>
        {!previewOpen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              clearMedia();
              setOpen(true);
            }}
            aria-label={m['agent.preview.open_gallery']()}
            title={m['agent.preview.open_gallery']()}
            className="text-muted-foreground hover:text-foreground ml-auto size-8 shrink-0 rounded-md"
          >
            <Images className="size-4" />
            {previewImages.length > 0 && (
              <span className="text-muted-foreground ml-1 text-xs">
                {previewImages.length}
              </span>
            )}
          </Button>
        )}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6">
        {chatQuery.isPending || chatQuery.isError ? (
          <p className="text-muted-foreground text-center text-sm">
            {m['agent.preview.loading']()}
          </p>
        ) : (
          <ChatTranscript
            messages={messages}
            sessionId={chatId}
            attachedImages={attachedImages}
            surfacedSrcs={surfacedSrcs}
          />
        )}
      </div>

      {/* Where the composer sits on the live page — read-only here, so it
          points at starting your own chat instead. */}
      <div className="shrink-0 px-4 pb-6">
        <div className="mx-auto flex w-full max-w-3xl justify-center">
          <Link
            href="/chat"
            className={cn(buttonVariants({ size: 'lg' }), 'gap-2 rounded-full')}
          >
            <Sparkles className="size-4" />
            {m['agent.share.create_cta']()}
          </Link>
        </div>
      </div>
    </main>
  );
}
