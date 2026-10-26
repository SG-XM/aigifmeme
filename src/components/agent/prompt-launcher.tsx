import { useRef, useState } from 'react';
import { FileVideo2, Play } from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import {
  isLocalChatMediaUrl,
  mediaTypeForFile,
  newAgentSessionId,
  newAttachmentId,
  publishChatMediaSources,
  uploadChatMedia,
  type PendingAttachment,
} from '@/lib/agent';
import { apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { useComposerSettings } from '@/hooks/use-composer-settings';
import {
  ChatComposer,
  type LibraryMedia,
} from '@/components/agent/chat-composer';
import { promptCategories } from '@/components/agent/prompt-examples';
import { VideoPreviewDialog } from '@/components/video-preview-dialog';
import { ViewportVideo } from '@/components/viewport-video';

// Attachments added by an example carry this id prefix so switching examples
// can swap them out without touching the user's own uploads.
const EXAMPLE_PREFIX = 'example:';

// Alternating real frame shapes makes the examples read as a film-wall,
// rather than a rigid thumbnail grid. The order matches video-lite's gallery.
const EXAMPLE_ASPECT_RATIOS = [
  '16 / 10',
  '4 / 5',
  '3 / 4',
  '16 / 9',
  '1 / 1',
  '2 / 3',
  '3 / 2',
  '9 / 16',
  '5 / 4',
  '4 / 3',
  '3 / 5',
] as const;

/**
 * The "start a new chat" surface: headline, prompt composer (local upload +
 * paste, image thumbnails) and one-click example prompts. Shared by the
 * landing hero and the /chat home page — both mint a session id and hand the
 * first turn (prompt, model settings, uploaded images) to /chat/$sessionId
 * through sessionStorage.
 */
export function PromptLauncher({ className }: { className?: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [composerSettings, setComposerSettings] = useComposerSettings();
  const [submitting, setSubmitting] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const examples = promptCategories()[0]?.examples ?? [];
  const preview =
    previewIndex === null ? null : (examples[previewIndex] ?? null);
  const uploading = attachments.some((item) => item.status === 'uploading');
  const hasUploaded = attachments.some((item) => item.status === 'uploaded');

  function navigatePreview(offset: number) {
    setPreviewIndex((current) => {
      if (current === null || examples.length === 0) return null;
      return (current + offset + examples.length) % examples.length;
    });
  }

  async function usePreviewAsReference() {
    const video = preview?.video;
    if (!preview || !video) return;
    if (isLocalChatMediaUrl(video) && !session?.user) {
      toast.error(m['landing.hero.sign_in_to_upload']());
      return;
    }
    const example = preview;
    const id = `${EXAMPLE_PREFIX}${example.key}-video`;
    const name = video.split('/').pop() || example.title;
    setPreviewIndex(null);
    setAttachments((prev) => {
      const next: PendingAttachment = {
        id,
        name,
        kind: 'video',
        preview: video,
        status: 'uploading',
      };
      return prev.some((item) => item.id === id)
        ? prev.map((item) => (item.id === id ? next : item))
        : [...prev, next];
    });

    try {
      const [url] = await publishChatMediaSources([{ src: video, name }]);
      if (!url) throw new Error('Upload failed');
      setAttachments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, url, status: 'uploaded' } : item
        )
      );
    } catch (error) {
      const message = (error as Error).message || 'Upload failed';
      toast.error(message);
      setAttachments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'error', error: message } : item
        )
      );
    }

    textareaRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'center',
    });
  }

  // Uploads need a session — the API rejects anonymous requests, so say why
  // instead of letting every thumbnail fail.
  async function addFiles(files: File[]) {
    const selected = files
      .map((file) => ({ file, kind: mediaTypeForFile(file) }))
      .filter(
        (item): item is { file: File; kind: 'image' | 'audio' | 'video' } =>
          item.kind !== null
      )
      .slice(0, 10);
    if (selected.length === 0) return;
    if (selected.some((item) => item.kind === 'image')) {
      void apiPost('/api/funnel/event', { event: 'photo_selected' }).catch(
        () => undefined
      );
    }
    if (!session?.user) {
      toast.error(m['landing.hero.sign_in_to_upload']());
      return;
    }

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
    if (
      selected.some((item) => isLocalChatMediaUrl(item.src)) &&
      !session?.user
    ) {
      toast.error(m['landing.hero.sign_in_to_upload']());
      return;
    }

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
      const ids = new Set(
        created
          .filter((item) => item.status === 'uploading')
          .map((item) => item.id)
      );
      setAttachments((current) =>
        current.map((item) =>
          ids.has(item.id) ? { ...item, status: 'error', error: message } : item
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

  function handleSubmit() {
    const prompt = value.trim();
    if ((!prompt && !hasUploaded) || uploading || submitting) return;
    setSubmitting(true);
    const sessionId = newAgentSessionId();
    // Hand the first turn off to the chat page via sessionStorage so it can
    // auto-send when it mounts. Avoids URL-encoding long prompts. Only
    // uploaded attachments survive the hop — the blob previews don't.
    try {
      sessionStorage.setItem(
        `agent:initial-turn:${sessionId}`,
        JSON.stringify({
          prompt,
          settings: composerSettings,
          attachments: attachments
            .filter((item) => item.status === 'uploaded' && item.url)
            .map((item) => ({ ...item, preview: item.url })),
        })
      );
    } catch {
      // sessionStorage unavailable — chat page will start blank.
    }
    router.push(`/chat/${sessionId}`);
  }

  return (
    <div className={cn('w-full', className)}>
      <h1 className="text-foreground mx-auto max-w-3xl text-center font-serif text-3xl font-normal tracking-[-0.01em] sm:text-4xl">
        {m['landing.hero.headline_1']()}
      </h1>

      <ChatComposer
        className="mx-auto mt-10 max-w-3xl"
        textareaRef={textareaRef}
        value={value}
        onValueChange={setValue}
        onSubmit={handleSubmit}
        placeholder={m['agent.home.placeholder']()}
        attachments={attachments}
        onAddFiles={(files) => void addFiles(files)}
        onAddLibraryMedia={(media) => void addLibraryMedia(media)}
        onRemoveAttachment={removeAttachment}
        settings={composerSettings}
        onSettingsChange={setComposerSettings}
        disabled={submitting}
        submitDisabled={(!value.trim() && !hasUploaded) || uploading}
      />

      <section className="mx-auto mt-14 max-w-3xl">
        <h2 className="text-foreground text-sm font-medium">
          {m['landing.examples.recommended']()}
        </h2>
        <div className="mt-4 columns-2 gap-2 sm:columns-3 lg:columns-4">
          {examples.map((example, index) => {
            return (
              <button
                key={example.key}
                type="button"
                onClick={() => setPreviewIndex(index)}
                aria-label={example.title}
                className="border-border bg-muted group focus-visible:ring-primary relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg border text-left focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                style={{
                  aspectRatio:
                    EXAMPLE_ASPECT_RATIOS[index % EXAMPLE_ASPECT_RATIOS.length],
                }}
              >
                {example.video && (
                  <ViewportVideo
                    src={example.video}
                    showMuteToggle={false}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                  />
                )}
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/5 opacity-20 transition-opacity group-hover:opacity-70" />
                <span className="pointer-events-none absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white opacity-0 shadow-lg backdrop-blur-md transition group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Play className="ml-0.5 size-3.5 fill-current" />
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pt-8 pb-3 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {example.title}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <VideoPreviewDialog
        open={preview !== null}
        item={
          preview?.video
            ? {
                src: preview.video,
                title: preview.title,
              }
            : null
        }
        index={previewIndex ?? -1}
        total={examples.length}
        labels={{
          video: m['showcase.dialog.video'](),
          download: m['showcase.dialog.download'](),
          previous: m['showcase.dialog.previous'](),
          next: m['showcase.dialog.next'](),
          close: m['showcase.dialog.close'](),
        }}
        downloadHref={preview?.video ?? '#'}
        onClose={() => setPreviewIndex(null)}
        onNavigate={navigatePreview}
        actions={
          preview ? (
            <div className="grid gap-2 lg:grid-cols-1">
              <button
                type="button"
                onClick={usePreviewAsReference}
                className="focus-visible:ring-primary flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:outline-none"
              >
                <FileVideo2 className="size-4" />
                {m['showcase.dialog.use_reference']()}
              </button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
