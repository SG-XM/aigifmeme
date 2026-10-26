import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Download, ExternalLink, Film, Play, X } from 'lucide-react';

import { isVideoUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import {
  usePreviewPane,
  type PreviewMedia,
} from '@/components/agent/preview-pane-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

// Pane sizing: never squeeze the conversation below MIN_CHAT_WIDTH, and keep
// the pane itself within a comfortable range.
const MIN_PANE_WIDTH = 360;
const MAX_PANE_WIDTH = 1100;
const MIN_CHAT_WIDTH = 360;
const DESKTOP_BREAKPOINT = 1024;
// Mirrors SIDEBAR_WIDTH / SIDEBAR_WIDTH_ICON in components/ui/sidebar.
const SIDEBAR_WIDTH = 256;
const SIDEBAR_ICON_WIDTH = 48;
// Re-expanding needs more room than collapsing frees, so the sidebar can't
// flip back and forth around a single pixel.
const EXPAND_HYSTERESIS = 80;

function chatWidthFor(
  paneWidth: number,
  sidebarShown: boolean,
  hasHistorySidebar: boolean
) {
  return (
    window.innerWidth -
    paneWidth -
    (hasHistorySidebar
      ? sidebarShown
        ? SIDEBAR_WIDTH
        : SIDEBAR_ICON_WIDTH
      : 0)
  );
}

function clampPaneWidth(next: number) {
  if (typeof window === 'undefined') return next;
  // Below `lg` the pane floats above the chat, so only the pane's own bounds
  // apply. On desktop the chat keeps MIN_CHAT_WIDTH — assuming the sidebar
  // collapses to its icon rail, which the effect below takes care of.
  const room =
    window.innerWidth >= DESKTOP_BREAKPOINT
      ? window.innerWidth - MIN_CHAT_WIDTH - SIDEBAR_ICON_WIDTH
      : MAX_PANE_WIDTH;
  const max = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, room));
  return Math.min(max, Math.max(MIN_PANE_WIDTH, next));
}

export function PreviewPane({
  hasHistorySidebar = true,
}: {
  hasHistorySidebar?: boolean;
}) {
  const { open, setOpen, image, images, openMedia } = usePreviewPane();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const [width, setWidth] = useState(620);
  // Only re-open the sidebar if we're the ones who closed it.
  const autoCollapsed = useRef(false);

  useEffect(() => {
    if (!open) return;
    const stopDrag = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      stopDrag();
    };
  }, [open]);

  // Re-clamp when the window changes size so a wide pane can't eat the whole
  // conversation on a narrower screen.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setWidth((current) => clampPaneWidth(current));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // Trade the sidebar for conversation width: collapse it once the chat gets
  // cramped, restore it when the pane shrinks back.
  useEffect(() => {
    if (!open) return;
    if (!hasHistorySidebar || window.innerWidth < DESKTOP_BREAKPOINT) return;
    if (
      sidebarOpen &&
      chatWidthFor(width, true, hasHistorySidebar) < MIN_CHAT_WIDTH
    ) {
      autoCollapsed.current = true;
      setSidebarOpen(false);
    } else if (
      !sidebarOpen &&
      autoCollapsed.current &&
      chatWidthFor(width, true, hasHistorySidebar) >=
        MIN_CHAT_WIDTH + EXPAND_HYSTERESIS
    ) {
      autoCollapsed.current = false;
      setSidebarOpen(true);
    }
  }, [open, width, sidebarOpen, setSidebarOpen, hasHistorySidebar]);

  if (!open) return null;

  function startResize(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      setWidth(clampPaneWidth(window.innerWidth - moveEvent.clientX));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Nothing picked yet — show the newest image, the one a viewer came for.
  const current = image ?? images[images.length - 1] ?? null;

  const index = current ? images.findIndex((i) => i.src === current.src) : -1;
  const title =
    index >= 0
      ? m['agent.preview.counter']({ current: index + 1, total: images.length })
      : m['agent.preview.gallery']({ count: images.length });

  return (
    <aside
      className="fixed top-16 right-0 bottom-0 z-30 flex max-w-[94vw] shrink-0 p-2 lg:relative lg:top-auto lg:bottom-auto lg:z-auto lg:h-full lg:pl-0"
      style={{ width }}
    >
      {/* Resize handle: a wide invisible hit area with a hairline that only
          shows on hover or while dragging. */}
      <div
        onMouseDown={startResize}
        className="group absolute top-6 bottom-6 -left-1.5 hidden w-3 cursor-col-resize lg:block"
        aria-hidden="true"
      >
        <span className="group-hover:bg-primary/50 group-active:bg-primary absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors" />
      </div>
      <div className="bg-background flex min-h-0 w-full flex-col overflow-hidden rounded-xl shadow-2xl lg:shadow-sm">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <span className="truncate text-sm font-medium">{title}</span>
          <div className="flex shrink-0 items-center gap-1">
            {current?.src && (
              <>
                <a
                  href={current.src}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={m['agent.preview.open']()}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    'text-muted-foreground hover:text-foreground size-8 rounded-md'
                  )}
                >
                  <ExternalLink className="size-4" />
                </a>
                {/* Proxied: <a download> is ignored cross-origin, so the
                    storage URL would just open in a tab. */}
                <a
                  href={`/api/storage/download?url=${encodeURIComponent(
                    current.src
                  )}${current.name ? `&name=${encodeURIComponent(current.name)}` : ''}`}
                  download={current.name}
                  aria-label={m['agent.preview.download']()}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    'text-muted-foreground hover:text-foreground size-8 rounded-md'
                  )}
                >
                  <Download className="size-4" />
                </a>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label={m['agent.preview.close']()}
              className="text-muted-foreground hover:text-foreground size-8 rounded-md"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {current ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto p-6">
              {/* Centred both ways: a short image shouldn't hug the top of a
                  tall pane. */}
              <div className="flex min-h-full items-center justify-center">
                <PreviewMediaElement
                  src={current.src}
                  alt={
                    current.alt || current.name || m['agent.preview.media']()
                  }
                  // The big view is where a clip is actually watched, so it
                  // gets full controls; the strip below stays silent.
                  controls
                  className="max-h-none max-w-full rounded-lg border object-contain shadow-sm"
                />
              </div>
            </div>
            {images.length > 1 && (
              <FilmStrip
                images={images}
                current={current}
                onSelect={openMedia}
              />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <EmptyPreview />
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Everything in the conversation, oldest first — uploaded stills and
 * generated clips alike. Clicking one swaps the large view above it.
 */
function FilmStrip({
  images,
  current,
  onSelect,
}: {
  images: PreviewMedia[];
  current: PreviewMedia;
  onSelect: (image: PreviewMedia) => void;
}) {
  return (
    <div className="shrink-0 overflow-x-auto px-4 py-3">
      <div className="flex gap-2">
        {images.map((item) => {
          const selected = item.src === current.src;
          return (
            <button
              key={item.src}
              type="button"
              onClick={() => onSelect(item)}
              title={item.name || item.alt || m['agent.preview.media']()}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'bg-muted relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                selected
                  ? 'border-primary'
                  : 'hover:border-border border-transparent'
              )}
            >
              <PreviewMediaElement
                src={item.src}
                alt={item.alt || item.name || m['agent.preview.media']()}
                className="size-full object-cover"
              />
              {isVideoUrl(item.src) && (
                // A paused first frame is indistinguishable from a still, so
                // the strip says which entries are clips.
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                  <Play className="size-4 fill-white text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="border-border bg-muted/40 flex size-12 items-center justify-center rounded-lg border">
        <Film className="text-muted-foreground size-5" />
      </div>
      <p className="mt-3 text-sm font-medium">
        {m['agent.preview.empty_title']()}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        {m['agent.preview.empty_description']()}
      </p>
    </div>
  );
}

/**
 * `controls` is only honoured for clips — the strip renders the same element
 * at thumbnail size, where a control bar would be unreadable, and a still
 * never has one.
 */
function PreviewMediaElement({
  src,
  alt,
  className,
  controls,
}: {
  src: string;
  alt: string;
  className?: string;
  controls?: boolean;
}) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        aria-label={alt || undefined}
        controls={controls}
        playsInline
        // metadata only: the strip can hold a dozen clips and preloading all
        // of them would pull tens of megabytes for a pane nobody scrolled to.
        preload="metadata"
        className={className}
      />
    );
  }
  return <img src={src} alt={alt} className={className} />;
}
