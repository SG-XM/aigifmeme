import { useEffect, useState, type MouseEvent } from 'react';
import { ArrowRight, Flame, Play, X } from 'lucide-react';

import { Link, usePathname, useRouter } from '@/core/i18n/navigation';
import {
  EFFECTS_ANNOUNCE_CARDS,
  EFFECTS_ANNOUNCE_MORE,
  markEffectsAnnounceSeen,
  shouldShowEffectsAnnounce,
  type EffectsAnnounceCard,
  type EffectsAnnounceCardId,
  type EffectsAnnounceMoreId,
} from '@/lib/effects-announce';
import { m } from '@/paraglide/messages.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * First-visit announcement that Window Peeper is live. Mounted only by the
 * homepage route. Any exit — a card, a trend pill, Keep making this one,
 * Escape, the backdrop, or the close button — sets the localStorage flag.
 */
export function EffectsAnnounce() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== '/') return;
    if (!shouldShowEffectsAnnounce(window.localStorage)) return;
    setOpen(true);
  }, [pathname]);

  const dismiss = () => {
    markEffectsAnnounceSeen(window.localStorage);
    setOpen(false);
  };

  const follow = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    const modified =
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0;
    dismiss();
    if (modified) return;
    event.preventDefault();
    window.setTimeout(() => router.push(href), 180);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[960px] flex-col gap-0 overflow-hidden border-[3px] border-[#171b27] bg-[#fff6f1] p-0 text-[#171b27] ring-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[960px] sm:rounded-3xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label={m['announce.effects.close']()}
          className="absolute end-3 top-3 z-20 flex size-11 items-center justify-center rounded-full border-2 border-[#171b27] bg-white text-[#171b27] shadow-[2px_2px_0_#171b27] hover:bg-[#fff6f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171b27]"
        >
          <X className="size-5" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <header className="bg-[#ff4f00] px-5 pe-16 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[#171b27] px-3 py-1 text-xs font-semibold text-white">
              <Flame className="size-3.5 text-[#ff4f00]" aria-hidden="true" />
              {m['announce.effects.badge']()}
            </p>
            <p className="mt-4 text-sm font-semibold">
              {m['announce.effects.kicker']()}
            </p>
            <DialogTitle className="mt-1 text-[1.7rem] leading-[1.05] font-bold tracking-tight text-balance text-[#171b27] sm:text-4xl">
              {m['announce.effects.title_before']()}
              <span className="inline-block rounded-md bg-white px-1.5 text-[#171b27]">
                {m['announce.effects.title_mark']()}
              </span>
              {m['announce.effects.title_after']().trim()
                ? ` ${m['announce.effects.title_after']().trim()}`
                : null}
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-2xl text-sm leading-relaxed text-[#171b27] sm:text-base">
              {m['announce.effects.description']()}
            </DialogDescription>
          </header>
          <div className="space-y-4 px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              {EFFECTS_ANNOUNCE_CARDS.map((card) => (
                <AnnounceCard
                  key={card.id}
                  card={card}
                  play={open}
                  onFollow={follow(card.href)}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-[#eadfd4] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[#555d6b]">
                  {m['announce.effects.more']()}
                </span>
                {EFFECTS_ANNOUNCE_MORE.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={follow(item.href)}
                    className="inline-flex min-h-10 items-center rounded-full border-2 border-[#171b27] bg-white px-3 text-sm font-semibold text-[#171b27] hover:bg-[#fff6f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4f00]"
                  >
                    {moreLabel(item.id)}
                  </Link>
                ))}
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="min-h-11 self-end px-1 text-sm font-medium underline underline-offset-4 hover:text-[#ff4f00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4f00] sm:self-auto"
              >
                {m['announce.effects.keep']()}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnnounceCard({
  card,
  play,
  onFollow,
}: {
  card: EffectsAnnounceCard;
  play: boolean;
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const copy = cardCopy(card.id);
  return (
    <article className="flex min-h-[220px] min-w-0 flex-1 overflow-hidden rounded-2xl border-2 border-[#171b27] bg-white shadow-[4px_4px_0_#171b27]">
      <div className="relative w-[38%] shrink-0 self-stretch bg-[#171b27] sm:w-[42%]">
        <AnnounceClip
          src={card.src}
          poster={card.poster}
          label={copy.title}
          play={play}
        />
        <span className="absolute start-2 top-2 rounded-full bg-[#171b27]/90 px-2 py-0.5 text-[11px] font-semibold text-white">
          {m['announce.effects.media_label']()}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
        {card.isNew ? (
          <span className="w-fit rounded-full bg-[#ff4f00] px-2 py-0.5 text-[11px] font-bold text-white">
            {m['announce.effects.new']()}
          </span>
        ) : (
          <span className="hidden h-5 md:block" aria-hidden="true" />
        )}
        <h3 className="text-lg leading-tight font-bold text-balance">
          {copy.title}
        </h3>
        <p className="text-sm leading-snug text-[#555d6b]">{copy.body}</p>
        <p className="text-xs font-medium">
          {m['announce.effects.meta']({
            duration: copy.duration,
            credits: card.credits,
          })}
        </p>
        <Link
          href={card.href}
          onClick={onFollow}
          className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#ff4f00] px-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(255,79,0,0.35)] hover:bg-[#e44700] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171b27]"
        >
          {copy.cta}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function AnnounceClip({
  src,
  poster,
  label,
  play,
}: {
  src: string;
  poster: string;
  label: string;
  play: boolean;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const showVideo = play && started && !reduceMotion;

  return (
    <>
      <img
        src={poster}
        alt=""
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {showVideo ? (
        <video
          src={src}
          poster={poster}
          aria-label={label}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : play && !reduceMotion ? (
        <button
          type="button"
          aria-label={label}
          onClick={() => setStarted(true)}
          className="absolute inset-0 z-10 flex items-end justify-end p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-black/70 text-white shadow-sm">
            <Play className="size-4" aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </>
  );
}

function cardCopy(id: EffectsAnnounceCardId) {
  if (id === 'peeper') {
    return {
      title: m['announce.effects.peeper.title'](),
      body: m['announce.effects.peeper.body'](),
      cta: m['announce.effects.peeper.cta'](),
      duration: m['announce.effects.peeper.duration'](),
    };
  }
  return {
    title: m['announce.effects.bridges.title'](),
    body: m['announce.effects.bridges.body'](),
    cta: m['announce.effects.bridges.cta'](),
    duration: m['announce.effects.bridges.duration'](),
  };
}

function moreLabel(id: EffectsAnnounceMoreId) {
  if (id === 'bulin') return m['announce.effects.more.bulin']();
  return m['announce.effects.more.sorry']();
}
