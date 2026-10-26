import { useEffect, useRef, type MouseEvent } from 'react';
import { ArrowRight, X } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import type { TrendingEffectMedia } from '@/lib/trending-effects';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface TrendingCard {
  id: string;
  href: string;
  name: string;
  hook: string;
  cta: string;
  fresh: boolean;
  media?: TrendingEffectMedia;
}

export interface TrendingPopupCopy {
  chip: string;
  title: string;
  lede: string;
  closeLabel: string;
  newLabel: string;
  cards: TrendingCard[];
}

/**
 * On-demand effect picker. Separate from the first-visit announce dialog:
 * white sheet, portrait phone frames, trend orange only on the chip and CTAs.
 */
export function TrendingPopup({
  open,
  onOpenChange,
  chip,
  title,
  lede,
  closeLabel,
  newLabel,
  cards,
}: TrendingPopupCopy & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    const modified =
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0;
    if (modified) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="trending-popup max-h-[calc(100dvh-1rem)] w-[calc(100%-1.25rem)] max-w-5xl overflow-x-hidden overflow-y-auto border-0 bg-white p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-[#171b27] shadow-[0_24px_70px_rgba(9,15,28,0.42),0_0_0_1px_rgba(244,91,0,0.16)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-5xl sm:p-6"
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={closeLabel}
          className="absolute end-2 top-2 z-10 flex size-11 items-center justify-center rounded-lg text-[#555d6b] hover:bg-[#f3f1ef]"
        >
          <X className="size-5" />
        </button>
        <DialogHeader className="pe-12">
          <p className="w-fit rounded-full bg-[#f45b00]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f45b00] uppercase">
            {chip}
          </p>
          <DialogTitle className="text-xl leading-snug font-semibold text-[#171b27]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#555d6b] sm:text-base">
            {lede}
          </DialogDescription>
        </DialogHeader>
        <ul className="trending-card-row flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:snap-none sm:grid-cols-2 sm:justify-items-center sm:overflow-visible lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
          {cards.map((card) => (
            <li
              key={card.id}
              className="w-[12.25rem] shrink-0 snap-start sm:w-full sm:max-w-[13rem]"
            >
              <Link
                href={card.href}
                onClick={follow}
                className="trending-card group flex h-full flex-col overflow-hidden rounded-2xl border border-[#f0e4da] bg-white shadow-[0_14px_36px_-20px_rgba(244,91,0,0.55)] ring-1 ring-[#f45b00]/10 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(244,91,0,0.62)] focus-visible:ring-3 focus-visible:ring-[#f45b00]/40 focus-visible:outline-none"
              >
                <div className="trending-card-frame relative aspect-[9/16] overflow-hidden bg-[#17130f]">
                  <CardMedia media={card.media} active={open} />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent"
                  />
                  {card.fresh && (
                    <span className="absolute start-2 top-2 rounded-md bg-[#f45b00] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#171b27] uppercase shadow-[0_0_16px_rgba(244,91,0,0.65)]">
                      {newLabel}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <h3 className="text-sm leading-tight font-semibold">
                    {card.name}
                  </h3>
                  <p className="line-clamp-2 text-[13px] leading-snug text-[#555d6b]">
                    {card.hook}
                  </p>
                  <span
                    className={cn(
                      buttonVariants({ size: 'sm' }),
                      'mt-auto h-auto min-h-9 w-full bg-[#f45b00] px-2 py-1.5 text-center text-xs leading-tight whitespace-normal text-[#171b27] group-hover:bg-[#ff7a2e]'
                    )}
                  >
                    {card.cta}
                    <ArrowRight className="size-3.5 shrink-0" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function CardMedia({
  media,
  active,
}: {
  media?: TrendingEffectMedia;
  active: boolean;
}) {
  if (media?.kind === 'image') {
    return (
      <img
        src={media.src}
        alt=""
        className="trending-still absolute inset-0 size-full object-cover"
        decoding="async"
        fetchPriority="high"
      />
    );
  }
  if (media?.kind === 'video') {
    return <CardVideo active={active} src={media.src} poster={media.poster} />;
  }
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-gradient-to-b from-[#3a2418] via-[#17130f] to-[#f45b00]/30"
    />
  );
}

function CardVideo({
  active,
  src,
  poster,
}: {
  active: boolean;
  src: string;
  poster?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (!active || motion.matches) video.pause();
      else void video.play().catch(() => {});
    };
    sync();
    motion.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      video.pause();
    };
  }, [active, src]);

  return (
    <>
      {poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
        />
      ) : null}
      <video
        ref={ref}
        src={active ? src : undefined}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        className="absolute inset-0 size-full object-cover"
      />
    </>
  );
}
