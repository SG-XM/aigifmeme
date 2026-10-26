import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface VideoPreviewItem {
  src: string;
  title: string;
}

export interface VideoPreviewLabels {
  video: string;
  download: string;
  previous: string;
  next: string;
  close: string;
}

/** Full-screen showcase player shared by video galleries. */
export function VideoPreviewDialog({
  open,
  item,
  index,
  total,
  labels,
  downloadHref,
  onClose,
  onNavigate,
  actions,
}: {
  open: boolean;
  item: VideoPreviewItem | null;
  index: number;
  total: number;
  labels: VideoPreviewLabels;
  downloadHref: string;
  onClose: () => void;
  onNavigate: (offset: number) => void;
  actions?: ReactNode;
}) {
  const canNavigate = index >= 0 && total > 1;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            onNavigate(-1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            onNavigate(1);
          }
        }}
        className="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none bg-[#101116] p-0 text-white ring-0 sm:max-w-none"
      >
        {item && (
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1">
            <div className="relative flex min-h-[52dvh] items-center justify-center overflow-hidden bg-[#080b12]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(227,50,160,0.18),transparent_48%),linear-gradient(135deg,#120b17_0%,#07050b_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

              <button
                type="button"
                onClick={onClose}
                aria-label={labels.close}
                className="focus-visible:ring-primary absolute top-4 right-4 z-30 flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/75 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white focus-visible:ring-2 focus-visible:outline-none lg:hidden"
              >
                <X className="size-4" />
              </button>

              <video
                key={item.src}
                src={item.src}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="relative z-10 max-h-[calc(52dvh-4rem)] max-w-[calc(100%-5rem)] bg-black shadow-[0_28px_90px_rgba(0,0,0,0.55)] lg:max-h-[calc(100dvh-3rem)] lg:max-w-[calc(100%-8rem)]"
              />

              {canNavigate && (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate(-1)}
                    aria-label={labels.previous}
                    className="focus-visible:ring-primary absolute left-3 z-20 flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-md transition-colors hover:bg-black/65 hover:text-white focus-visible:ring-2 focus-visible:outline-none sm:left-5"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate(1)}
                    aria-label={labels.next}
                    className="focus-visible:ring-primary absolute right-3 z-20 flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-md transition-colors hover:bg-black/65 hover:text-white focus-visible:ring-2 focus-visible:outline-none sm:right-5"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-medium text-white/70 backdrop-blur-md">
                    {index + 1} / {total}
                  </span>
                </>
              )}
            </div>

            <aside className="relative z-20 flex max-h-[48dvh] min-h-0 flex-col overflow-hidden border-t border-white/10 bg-[#0b0b0d]/96 text-white backdrop-blur-xl lg:m-3 lg:ml-0 lg:max-h-none lg:rounded-[1.25rem] lg:border">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
                <a
                  href={downloadHref}
                  download
                  className="focus-visible:ring-primary inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Download className="size-3.5" />
                  {labels.download}
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={labels.close}
                  className="focus-visible:ring-primary hidden size-9 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:outline-none lg:flex"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <DialogTitle className="text-xs font-medium tracking-[0.12em] text-white/45 uppercase">
                  {labels.video}
                </DialogTitle>
                <p className="mt-2 text-sm leading-relaxed font-medium text-white/95">
                  {item.title}
                </p>
              </div>

              {actions && (
                <div className="border-t border-white/8 p-4">{actions}</div>
              )}
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
