import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

import { useRouter } from '@/core/i18n/navigation';
import {
  isLocalChatMediaUrl,
  mediaTypeForFile,
  newAttachmentId,
  publishChatMediaSources,
  uploadChatMedia,
  type PendingAttachment,
} from '@/lib/agent';
import {
  splitAttachedImages,
  storedToMessages,
  type ChatHistoryData,
  type InitialTurnPayload,
} from '@/lib/agent-chat';
import {
  dropRun,
  hasRun,
  seedRun,
  startRun,
  stopRun,
  useAgentRun,
} from '@/lib/agent-runs';
import {
  defaultComposerSettings,
  resolveGenerationSettings,
  type AgentGenerationSettings,
} from '@/lib/agent-settings';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { readCheckoutResume } from '@/lib/checkout-resume';
import { notifyCreditsChanged } from '@/lib/credits-changed';
import { mediaNameFromUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { useComposerSettings } from '@/hooks/use-composer-settings';
import { CreditPurchaseDialog } from '@/blocks/credit-purchase-dialog';
import { useAgentHeader } from '@/components/agent/agent-header-context';
import {
  ChatComposer,
  type LibraryMedia,
} from '@/components/agent/chat-composer';
import { ChatShareMenu } from '@/components/agent/chat-share-menu';
import {
  ChatTranscript,
  useTranscriptImages,
} from '@/components/agent/chat-transcript';
import { notifyChatsChanged } from '@/components/agent/chats-sidebar';
import { usePreviewPane } from '@/components/agent/preview-pane-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/(agent)/chat/$sessionId')({
  validateSearch: (search) => ({
    preview: typeof search.preview === 'string' ? search.preview : undefined,
    previewName:
      typeof search.previewName === 'string' ? search.previewName : undefined,
    previewAlt:
      typeof search.previewAlt === 'string' ? search.previewAlt : undefined,
  }),
  component: ChatSessionPage,
});

function ChatSessionPage() {
  const { sessionId } = Route.useParams();
  const router = useRouter();
  const search = Route.useSearch();
  const { setContent: setHeaderContent } = useAgentHeader();
  const {
    setOpen: setPreviewOpen,
    clearMedia: clearPreviewImage,
    setImages: setPreviewImages,
    openMedia,
  } = usePreviewPane();

  const sessionLabel = sessionId.replace(/^s-/, '').slice(0, 12);
  const [title, setTitle] = useState(`session · ${sessionLabel}`);
  const [topUpOpen, setTopUpOpen] = useState(false);
  useEffect(() => {
    if (
      readCheckoutResume(window.location.search)?.placement ===
      'credit-insufficient'
    )
      setTopUpOpen(true);
  }, []);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(title);

  // The transcript and its stream live in the run store, not in this
  // component — a turn keeps going when you switch chats or leave the page.
  const { messages, streaming } = useAgentRun(sessionId);
  const [serverRunning, setServerRunning] = useState(false);
  const pendingGeneration = useMemo(
    () =>
      messages.some(
        (message) =>
          message.role === 'tool-group' &&
          message.tools.some(
            (tool) =>
              tool.result === undefined &&
              (tool.name === 'generate_video' || tool.name === 'animate_image')
          )
      ),
    [messages]
  );
  const generationRunning = streaming || serverRunning || pendingGeneration;
  const [value, setValue] = useState('');
  const [composerSettings, setComposerSettings] = useComposerSettings();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const initialPromptHandled = useRef(false);
  const lastSessionId = useRef(sessionId);

  useEffect(() => {
    setHeaderContent({
      actions: <ChatShareMenu sessionId={sessionId} />,
      title,
      onEditClick: () => {
        setRenameValue(title);
        setRenameOpen(true);
      },
    });
    return () => setHeaderContent({});
  }, [title, setHeaderContent]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(distance < 40);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Switching to a different chat resets only what belongs to this view —
  // composer draft, title, preview pane. The other chat's turn keeps running
  // in the store, and this one's transcript comes back from it.
  useEffect(() => {
    if (lastSessionId.current === sessionId) return;
    // Free the previous chat's cached transcript — unless it's still working,
    // in which case the store keeps it alive. History is refetched on return.
    dropRun(lastSessionId.current);
    lastSessionId.current = sessionId;

    const nextTitle = `session · ${sessionId.replace(/^s-/, '').slice(0, 12)}`;
    attachmentsRef.current.forEach((item) => {
      if (item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
    });
    setTitle(nextTitle);
    setRenameValue(nextTitle);
    setValue('');
    setAttachments([]);
    setAtBottom(true);
    setPreviewOpen(false);
    clearPreviewImage();
    setPreviewImages([]);
    initialPromptHandled.current = false;
  }, [sessionId, setPreviewOpen, clearPreviewImage, setPreviewImages]);

  // The pane lives in the layout, so it survives navigation — and the effect
  // above only fires when this component stays mounted across a session
  // switch. Reset on every mount too, or a new chat opens showing the previous
  // one's pane. `?preview=` (opening an image from the library) is the one
  // case where the pane is meant to be open right away.
  useEffect(() => {
    if (search.preview) return;
    setPreviewOpen(false);
    clearPreviewImage();
    setPreviewImages([]);
    // Session id included so a remount-free switch resets as well.
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((item) => {
        if (item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      });
    };
  }, []);

  // Load any persisted history for this session. No chat row means one of two
  // things: a session this browser just minted (not written to the DB until
  // its first turn), or someone else's link — the API scopes the lookup to the
  // caller, so another user's chat reads as missing. The first is legitimate,
  // the second lands on a blank page whose first message would collide on the
  // primary key, so send it back to a new chat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Read, don't consume — the initial-turn effect below still needs it.
      const pendingTurn = (() => {
        try {
          return !!sessionStorage.getItem(`agent:initial-turn:${sessionId}`);
        } catch {
          return false;
        }
      })();
      try {
        const data = await apiGet<ChatHistoryData>(
          `/api/agent/chat/${encodeURIComponent(sessionId)}`
        );
        if (cancelled) return;
        if (!data.chat) {
          if (!pendingTurn && !hasRun(sessionId)) router.replace('/chat');
          return;
        }
        if (data.chat.title) setTitle(data.chat.title);
        setServerRunning(data.run?.active === true);
        const stored = data.messages ?? [];
        // Ignored while a turn is streaming — the live transcript is ahead of
        // what the server has persisted.
        if (stored.length > 0) seedRun(sessionId, storedToMessages(stored));
      } catch {
        // ignore — we just won't have history
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  // If the browser stream disappeared but the durable provider task is still
  // alive, keep checking history. Completion/failure is then restored into
  // the transcript instead of leaving an eternal "Executing…" row.
  useEffect(() => {
    if (streaming || (!serverRunning && !pendingGeneration)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await apiGet<ChatHistoryData>(
          `/api/agent/chat/${encodeURIComponent(sessionId)}`
        );
        if (cancelled) return;
        setServerRunning(data.run?.active === true);
        const stored = data.messages ?? [];
        if (stored.length > 0) seedRun(sessionId, storedToMessages(stored));
      } catch {
        // Keep the last known state; the next poll can recover.
      }
    };
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, streaming, serverRunning, pendingGeneration]);

  const send = useCallback(
    (
      text: string,
      imageAttachments: PendingAttachment[] = [],
      settings: AgentGenerationSettings = {},
      // Fired once the server has accepted the turn (and therefore persisted
      // the user message) — the caller uses it to drop its retry copy.
      onAccepted?: () => void
    ) => {
      void startRun({
        sessionId,
        text,
        attachments: imageAttachments,
        settings,
        onAccepted: () => {
          onAccepted?.();
          // The chat row exists the moment the server accepts the turn, so
          // the sidebar can show it (with its spinner) right away instead of
          // only when the turn finishes.
          notifyChatsChanged();
        },
        onSettled: () => {
          setServerRunning(false);
          // The title is derived from the first message and the chat bubbles
          // to the top on updatedAt; the balance moved if the turn generated
          // anything.
          notifyChatsChanged();
          notifyCreditsChanged();
        },
        // Offer a one-time pack whenever a generation needs more credits.
        onInsufficientCredits: () => {
          onAccepted?.();
          setTopUpOpen(true);
        },
      });
    },
    [sessionId]
  );

  // Auto-send the prompt typed on /chat, if any.
  useEffect(() => {
    if (initialPromptHandled.current) return;
    initialPromptHandled.current = true;
    try {
      const key = `agent:initial-prompt:${sessionId}`;
      const turnKey = `agent:initial-turn:${sessionId}`;
      const rawTurn = sessionStorage.getItem(turnKey);
      if (rawTurn) {
        const payload = JSON.parse(rawTurn) as InitialTurnPayload;
        if (payload.settings) setComposerSettings(payload.settings);
        const initialAttachments = (payload.attachments ?? []).filter(
          (item) => item.status === 'uploaded' && item.url
        );
        if (payload.prompt || initialAttachments.length > 0) {
          // The stash is only dropped once the server has the turn. If this
          // page re-mounts before that (dev HMR, a stray re-render), the
          // handoff survives and the turn is retried instead of vanishing.
          send(
            payload.prompt ?? '',
            initialAttachments,
            resolveGenerationSettings(
              payload.settings ?? defaultComposerSettings()
            ),
            () => sessionStorage.removeItem(turnKey)
          );
          return;
        }
        sessionStorage.removeItem(turnKey);
      }
      const stashed = sessionStorage.getItem(key);
      if (stashed) {
        send(stashed, [], resolveGenerationSettings(composerSettings), () =>
          sessionStorage.removeItem(key)
        );
      }
    } catch {
      // ignore
    }
  }, [sessionId, send, composerSettings]);

  function handleSend() {
    const uploadedAttachments = attachments.filter(
      (item) => item.status === 'uploaded' && item.url
    );
    const hasUploading = attachments.some(
      (item) => item.status === 'uploading'
    );
    if (hasUploading) return;

    const text = value;
    if (!text.trim() && uploadedAttachments.length === 0) return;
    setValue('');
    setAttachments([]);
    send(
      text,
      uploadedAttachments,
      resolveGenerationSettings(composerSettings)
    );
  }

  const handleStop = useCallback(() => {
    // Resolve the current UI immediately, then ask the server to cancel the
    // durable task as well. This path also works after reload when there is no
    // browser AbortController left to abort.
    stopRun(sessionId);
    setServerRunning(false);
    void apiPost(`/api/agent/chat/${encodeURIComponent(sessionId)}/stop`).then(
      () => {
        notifyChatsChanged();
        notifyCreditsChanged();
      },
      (error: Error) => toast.error(error.message)
    );
  }, [sessionId]);

  async function handleFiles(files: File[]) {
    const selected = files
      .map((file) => ({ file, kind: mediaTypeForFile(file) }))
      .filter(
        (item): item is { file: File; kind: 'image' | 'audio' | 'video' } =>
          item.kind !== null
      )
      .slice(0, 10);
    if (selected.length === 0) return;

    const created = selected.map(({ file, kind }) => ({
      id: newAttachmentId(),
      name: file.name || 'media',
      kind,
      preview: URL.createObjectURL(file),
      status: 'uploading' as const,
      file,
    }));

    setAttachments((prev) => [
      ...prev,
      ...created.map(({ file: _file, ...item }) => item),
    ]);

    try {
      const urls = await uploadChatMedia(created.map((item) => item.file));
      setAttachments((prev) =>
        prev.map((item) => {
          const index = created.findIndex(
            (createdItem) => createdItem.id === item.id
          );
          return index >= 0 && urls[index]
            ? { ...item, url: urls[index], status: 'uploaded' }
            : item;
        })
      );
    } catch (err) {
      const error = (err as Error).message || 'Upload failed';
      toast.error(error);
      const createdIds = new Set(created.map((item) => item.id));
      setAttachments((prev) =>
        prev.map((item) =>
          createdIds.has(item.id) ? { ...item, status: 'error', error } : item
        )
      );
    }
  }

  async function addLibraryMedia(media: LibraryMedia[]) {
    const selected = media.filter(
      (item) =>
        !attachments.some(
          (attachment) =>
            attachment.preview === item.src || attachment.url === item.src
        )
    );
    if (selected.length === 0) return;

    const created: PendingAttachment[] = selected.map((item) => ({
      id: newAttachmentId(),
      name: item.name || 'video',
      kind: 'video',
      preview: item.src,
      ...(isLocalChatMediaUrl(item.src) ? {} : { url: item.src }),
      status: isLocalChatMediaUrl(item.src) ? 'uploading' : 'uploaded',
    }));
    setAttachments((previous) => [...previous, ...created]);

    try {
      const urls = await publishChatMediaSources(
        selected.map((item) => ({ src: item.src, name: item.name }))
      );
      setAttachments((current) =>
        current.map((item) => {
          const index = created.findIndex(
            (createdItem) => createdItem.id === item.id
          );
          return index >= 0 && urls[index]
            ? { ...item, url: urls[index], status: 'uploaded' }
            : item;
        })
      );
    } catch (error) {
      const message = (error as Error).message || 'Upload failed';
      toast.error(message);
      const localIds = new Set(
        created
          .filter((item) => item.status === 'uploading')
          .map((item) => item.id)
      );
      setAttachments((current) =>
        current.map((item) =>
          localIds.has(item.id)
            ? { ...item, status: 'error', error: message }
            : item
        )
      );
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.preview.startsWith('blob:'))
        URL.revokeObjectURL(target.preview);
      return prev.filter((item) => item.id !== id);
    });
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  async function commitRename() {
    const next = renameValue.trim();
    if (next && next !== title) {
      setTitle(next);
      try {
        await apiPatch(`/api/agent/chat/${encodeURIComponent(sessionId)}`, {
          title: next,
        });
        notifyChatsChanged();
      } catch {
        // ignore — local state already updated; sidebar will reconcile
      }
    }
    setRenameOpen(false);
  }

  // Tool-output images (base64 or file paths in tool_result) are surfaced on
  // the *next* agent reply so they appear as part of the assistant's answer,
  // not inside the tool panel. `surfacedSrcs` lets each agent bubble suppress
  // duplicate inline copies the model may have re-embedded.
  const { attachedImages, surfacedSrcs, previewImages } = useTranscriptImages(
    messages,
    sessionId
  );

  useEffect(() => {
    setPreviewImages(
      previewImages.map((img) => ({
        src: img.src,
        alt: img.alt,
        name: mediaNameFromUrl(img.src) || img.alt,
      }))
    );
  }, [previewImages, setPreviewImages]);

  // Apply `?preview=` once per URL value. `previewImages` is rebuilt whenever
  // the transcript store emits, so without this guard every re-render (a
  // filmstrip click included) would snap the pane back to the URL's image.
  const appliedPreview = useRef<string | null>(null);
  useEffect(() => {
    if (!search.preview) {
      appliedPreview.current = null;
      return;
    }
    if (appliedPreview.current === search.preview) return;
    appliedPreview.current = search.preview;

    const matched = previewImages.find((img) => img.src === search.preview);
    const src = matched?.src ?? search.preview;
    openMedia({
      src,
      alt: search.previewAlt || matched?.alt || mediaNameFromUrl(src),
      name:
        search.previewName ||
        mediaNameFromUrl(src) ||
        matched?.alt ||
        m['agent.preview.image'](),
    });
  }, [
    search.preview,
    search.previewAlt,
    search.previewName,
    sessionId,
    previewImages,
    openMedia,
  ]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6"
      >
        <ChatTranscript
          messages={messages}
          streaming={streaming}
          sessionId={sessionId}
          attachedImages={attachedImages}
          surfacedSrcs={surfacedSrcs}
        />

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            className="border-border bg-background text-muted-foreground hover:text-foreground absolute bottom-4 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 overflow-hidden px-4 pb-6">
        <div className="mx-auto w-full max-w-3xl min-w-0 space-y-2">
          <ChatComposer
            size="sm"
            value={value}
            onValueChange={setValue}
            onSubmit={handleSend}
            onStop={handleStop}
            placeholder={m['agent.chat.placeholder']()}
            attachments={attachments}
            onAddFiles={(files) => void handleFiles(files)}
            onAddLibraryMedia={(media) => void addLibraryMedia(media)}
            onRemoveAttachment={removeAttachment}
            settings={composerSettings}
            onSettingsChange={setComposerSettings}
            disabled={generationRunning}
            running={generationRunning}
            submitDisabled={
              attachments.some((item) => item.status === 'uploading') ||
              (!value.trim() &&
                !attachments.some((item) => item.status === 'uploaded'))
            }
          />
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['agent.chat.rename_title']()}</DialogTitle>
            <DialogDescription>
              {m['agent.chat.rename_description']()}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commitRename();
              }
            }}
            placeholder={m['agent.chat.rename_placeholder']()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {m['agent.chat.cancel']()}
            </Button>
            <Button onClick={commitRename} disabled={!renameValue.trim()}>
              {m['agent.chat.save']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreditPurchaseDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        redirect="/chat"
        placement="credit-insufficient"
      />
    </div>
  );
}
