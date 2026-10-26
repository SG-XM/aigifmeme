import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowUp,
  Check,
  FileAudio2,
  Film,
  Images,
  Loader2,
  Paperclip,
  Plus,
  Square,
  X,
} from 'lucide-react';

import {
  imageFilesFromClipboard,
  mediaTypeForAttachment,
  type PendingAttachment,
} from '@/lib/agent';
import { type AgentComposerSettings } from '@/lib/agent-settings';
import { apiGet } from '@/lib/api-client';
import { isVideoUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { ComposerControls } from '@/components/agent/composer-controls';
import { ComposerSettings } from '@/components/agent/composer-settings';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface LibraryMedia {
  id: string;
  src: string;
  name: string;
  alt: string;
}

interface LibraryData {
  images?: LibraryMedia[];
  nextCursor?: string;
}

/**
 * The prompt input shared by the launcher (landing hero + /chat) and the
 * chat session page: image thumbnails, "+" menu for local uploads, paste-to-
 * upload, model settings and submit. The owner keeps the state — this only
 * renders it.
 */
export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  placeholder,
  attachments,
  onAddFiles,
  onAddLibraryMedia,
  onRemoveAttachment,
  settings,
  onSettingsChange,
  disabled = false,
  running = false,
  submitDisabled = false,
  size = 'lg',
  toolbarExtra,
  textareaRef,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  placeholder: string;
  attachments: PendingAttachment[];
  onAddFiles: (files: File[]) => void;
  onAddLibraryMedia: (media: LibraryMedia[]) => void;
  onRemoveAttachment: (id: string) => void;
  settings: AgentComposerSettings;
  onSettingsChange: (settings: AgentComposerSettings) => void;
  disabled?: boolean;
  running?: boolean;
  submitDisabled?: boolean;
  /** `lg` on the start screens, `sm` for the follow-up box in a session. */
  size?: 'sm' | 'lg';
  /** Rendered next to the "+" menu (e.g. the selected example category). */
  toolbarExtra?: ReactNode;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const uploading = attachments.some((item) => item.status === 'uploading');
  const cannotSubmit = disabled || submitDisabled || uploading;

  const attachmentLabels = {
    image: m['agent.composer.media_image'](),
    audio: m['agent.composer.media_audio'](),
    video: m['agent.composer.media_video'](),
  } as const;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (cannotSubmit) return;
        onSubmit();
      }}
      className={cn(
        'border-border bg-card rounded-3xl border shadow-sm transition-shadow focus-within:shadow-md',
        className
      )}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((item) => {
            const mediaType = mediaTypeForAttachment(item);
            return (
              <div
                key={item.id}
                className="border-border bg-muted/50 flex max-w-full items-center gap-2 rounded-xl border p-1.5 pr-2"
                title={item.error || item.name}
              >
                {mediaType === 'image' ? (
                  <img
                    src={item.preview}
                    alt=""
                    className={cn(
                      'size-9 shrink-0 rounded-lg object-cover',
                      item.status === 'error' && 'opacity-50'
                    )}
                  />
                ) : mediaType === 'video' ? (
                  <video
                    src={item.preview}
                    muted
                    playsInline
                    preload="metadata"
                    className={cn(
                      'size-9 shrink-0 rounded-lg object-cover',
                      item.status === 'error' && 'opacity-50'
                    )}
                  />
                ) : (
                  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <FileAudio2 className="size-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="text-foreground block max-w-36 truncate text-xs font-medium sm:max-w-48">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                    {item.status === 'uploading' && (
                      <Loader2 className="size-2.5 animate-spin" />
                    )}
                    {item.status === 'uploading'
                      ? m['agent.composer.uploading']()
                      : attachmentLabels[mediaType]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(item.id)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground ml-1 flex size-6 shrink-0 items-center justify-center rounded-full transition-colors"
                  aria-label={m['agent.composer.remove_material']()}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onPaste={(e) => {
          const images = imageFilesFromClipboard(e.clipboardData);
          if (images.length === 0) return;
          e.preventDefault();
          onAddFiles(images);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (cannotSubmit) return;
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={size === 'lg' ? 3 : 2}
        disabled={disabled}
        className={cn(
          'text-foreground placeholder:text-muted-foreground w-full resize-none rounded-3xl bg-transparent px-4 pt-4 pb-2 leading-relaxed focus:outline-none',
          size === 'lg' ? 'min-h-[92px] text-sm' : 'min-h-[64px] text-sm'
        )}
      />

      {/* Wraps on narrow screens: "+" + category chip + model + settings +
          submit is wider than a 390px viewport. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={disabled}
                  aria-label={m['agent.home.attach']()}
                  className="text-muted-foreground size-8 rounded-full"
                />
              }
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="gap-2.5"
              >
                <Paperclip className="size-4" />
                {m['landing.hero.upload_local']()}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLibraryOpen(true)}
                className="gap-2.5"
              >
                <Images className="size-4" />
                {m['agent.composer.add_from_library']()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,.mp3,.m4a,.wav,.ogg,video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v"
            multiple
            aria-label={m['landing.hero.upload_local']()}
            className="sr-only"
            onChange={(event) => {
              onAddFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }}
          />
          {toolbarExtra}
        </div>
        {/* ml-auto keeps this group right-aligned after the row wraps. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ComposerControls
            settings={settings}
            onChange={onSettingsChange}
            disabled={disabled}
          />
          <ComposerSettings
            settings={settings}
            onChange={onSettingsChange}
            disabled={disabled}
          />
          <Button
            type={running ? 'button' : 'submit'}
            size="icon"
            aria-label={
              running
                ? m['agent.chat.stop_generation']()
                : m['agent.home.submit']()
            }
            title={running ? m['agent.chat.stop_generation']() : undefined}
            onClick={running ? onStop : undefined}
            disabled={running ? !onStop : cannotSubmit}
            className="size-8 rounded-full"
          >
            {running ? (
              <Square className="size-3.5 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </div>
      <LibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onAdd={(media) => {
          onAddLibraryMedia(media);
          setLibraryOpen(false);
        }}
      />
    </form>
  );
}

/** Reuse clips generated in earlier conversations without uploading again. */
function LibraryPicker({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (media: LibraryMedia[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const libraryQuery = useInfiniteQuery({
    queryKey: ['agent-library', 'composer-picker'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiGet<LibraryData>(
        pageParam
          ? `/api/agent/library?limit=30&cursor=${encodeURIComponent(pageParam)}`
          : '/api/agent/library?limit=30'
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: open,
  });
  const media =
    libraryQuery.data?.pages.flatMap((page) => page.images ?? []) ?? [];

  useEffect(() => {
    if (!open) setSelectedIds(new Set());
  }, [open]);

  function toggleMedia(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selected = media.filter((item) => selectedIds.has(item.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(80dvh,46rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m['agent.composer.library_title']()}</DialogTitle>
          <DialogDescription>
            {m['agent.composer.library_description']()}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          {libraryQuery.isLoading ? (
            <LibraryPickerState text={m['agent.library.loading']()} />
          ) : libraryQuery.isError ? (
            <LibraryPickerState
              text={m['agent.composer.library_load_failed']()}
            />
          ) : media.length === 0 ? (
            <LibraryPickerState text={m['agent.composer.library_empty']()} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {media.map((item) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleMedia(item.id)}
                      aria-pressed={selected}
                      className={cn(
                        'group border-border bg-muted focus-visible:ring-ring relative aspect-video overflow-hidden rounded-md border text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        selected && 'border-primary ring-primary/30 ring-2'
                      )}
                    >
                      {isVideoUrl(item.src) ? (
                        <video
                          src={item.src}
                          aria-label={item.alt || item.name}
                          muted
                          playsInline
                          preload="metadata"
                          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                      ) : (
                        <img
                          src={item.src}
                          alt={item.alt || item.name}
                          loading="lazy"
                          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                      )}
                      {selected && (
                        <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-5 items-center justify-center rounded-full shadow-sm">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {libraryQuery.hasNextPage && (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => libraryQuery.fetchNextPage()}
                    disabled={libraryQuery.isFetchingNextPage}
                  >
                    {libraryQuery.isFetchingNextPage
                      ? m['agent.library.loading']()
                      : m['agent.library.load_more']()}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onAdd(selected)}
            disabled={selected.length === 0}
          >
            {m['agent.composer.add_selected']({ count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LibraryPickerState({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
      <Film className="size-5" />
      <p>{text}</p>
    </div>
  );
}
