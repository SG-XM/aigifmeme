/** Photo-picker anchor on the homepage. Hash links use the same id. */
export const HOME_CREATE_ELEMENT_ID = 'create';

const HISTORY_POP_WINDOW_MS = 1500;
const LAYOUT_FALLBACK_MS = 2000;
const HERO_REFLOW_WINDOW_MS = 3000;
const ALIGN_SLACK_PX = 16;
const HEADER_CLEARANCE_PX = 8;
const MAX_SCROLL_PASSES = 4;

let historyPopAt = 0;

/** Clears the back/forward guard. Tests only. */
export function resetHomeCreateScrollForTests() {
  historyPopAt = 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    historyPopAt = Date.now();
  });
}

/**
 * Empty hash and `#create` both belong on the photo picker.
 * Any other fragment (`#about`, `#faq`, …) is an explicit section link.
 */
export function shouldAutoScrollHomeToCreate(hash: string): boolean {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  return id === '' || id === HOME_CREATE_ELEMENT_ID;
}

/** True when this mount was a back/forward that should keep the saved position. */
export function isRecentHistoryRestore(now = Date.now()): boolean {
  return historyPopAt > 0 && now - historyPopAt < HISTORY_POP_WINDOW_MS;
}

/** Smooth on a normal load. `prefers-reduced-motion: reduce` jumps with no animation. */
export function homeCreateScrollBehavior(win: Window): ScrollBehavior {
  const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'instant' : 'smooth';
}

function scrollMarginTop(win: Window, el: HTMLElement): number {
  const value = Number.parseFloat(win.getComputedStyle(el).scrollMarginTop);
  return Number.isFinite(value) ? value : 0;
}

function stickyHeaderHeight(win: Window): number {
  const header = win.document.querySelector('header');
  return header?.getBoundingClientRect().height ?? 0;
}

/**
 * `scroll-mt-24` is the minimum clearance. A taller sticky header (safe area
 * included) wins so the upload control stays below it and in thumb reach.
 */
export function homeCreateScrollOffset(win: Window, el: HTMLElement): number {
  return Math.max(
    scrollMarginTop(win, el),
    Math.ceil(stickyHeaderHeight(win) + HEADER_CLEARANCE_PX)
  );
}

function ensureCreateClearance(win: Window, el: HTMLElement) {
  const needed = homeCreateScrollOffset(win, el);
  if (needed > scrollMarginTop(win, el) + 0.5) {
    el.style.scrollMarginTop = `${needed}px`;
  }
}

/** The upload card's top sits on its scroll offset, under the sticky header. */
export function isHomeCreateAligned(win: Window, el: HTMLElement): boolean {
  const top = el.getBoundingClientRect().top;
  return Math.abs(top - homeCreateScrollOffset(win, el)) <= ALIGN_SLACK_PX;
}

/**
 * Scrolls `#create` the same way a `/#create` link does (`scroll-margin` / `scroll-mt-24`).
 * Returns false when a different hash is active or the card is already in place.
 */
export function scrollHomeCreateIntoView(
  win: Window,
  behavior: ScrollBehavior = homeCreateScrollBehavior(win)
): boolean {
  if (!shouldAutoScrollHomeToCreate(win.location.hash)) return false;
  const el = win.document.getElementById(HOME_CREATE_ELEMENT_ID);
  if (!el) return false;
  ensureCreateClearance(win, el);
  if (isHomeCreateAligned(win, el)) return false;
  el.scrollIntoView({ block: 'start', inline: 'nearest', behavior });
  return true;
}

/**
 * After the homepage document and fonts have laid out, scroll the photo picker
 * into view. A later pass corrects router scroll-to-top and hero reflow.
 * Wheel, touch, keys, and pointer input cancel it so a reader is not pulled back.
 */
export function watchHomeCreateScroll(win: Window = window): () => void {
  if (
    isRecentHistoryRestore() ||
    !shouldAutoScrollHomeToCreate(win.location.hash)
  ) {
    return () => undefined;
  }

  let stopped = false;
  let userMoved = false;
  let smoothActive = false;
  let passes = 0;
  let fallbackTimer = 0;
  let settleTimer = 0;
  let heroTimer = 0;
  let heroObserver: ResizeObserver | undefined;

  const stopForUser = () => {
    userMoved = true;
  };
  const onHashChange = () => {
    if (!shouldAutoScrollHomeToCreate(win.location.hash)) userMoved = true;
  };
  const userEvents = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
  for (const type of userEvents) {
    win.addEventListener(type, stopForUser, { capture: true, passive: true });
  }
  win.addEventListener('hashchange', onHashChange);

  const align = () => {
    if (stopped || userMoved || smoothActive || passes >= MAX_SCROLL_PASSES) {
      return;
    }
    const behavior = homeCreateScrollBehavior(win);
    if (!scrollHomeCreateIntoView(win, behavior)) return;
    passes += 1;
    // A follow-up pass must not snap over an in-flight smooth scroll.
    smoothActive = behavior === 'smooth';
  };

  const settle = () => {
    if (stopped || userMoved) return;
    smoothActive = false;
    const el = win.document.getElementById(HOME_CREATE_ELEMENT_ID);
    if (!el || isHomeCreateAligned(win, el)) return;
    align();
  };

  const watchHeroReflow = () => {
    const hero = win.document.getElementById('hero');
    if (!hero || typeof ResizeObserver === 'undefined') return;
    const startHeight = hero.getBoundingClientRect().height;
    heroObserver = new ResizeObserver(() => {
      if (smoothActive) return;
      const nextHeight = hero.getBoundingClientRect().height;
      if (Math.abs(nextHeight - startHeight) < 2) return;
      settle();
    });
    heroObserver.observe(hero);
    heroTimer = win.setTimeout(() => {
      heroObserver?.disconnect();
      heroObserver = undefined;
    }, HERO_REFLOW_WINDOW_MS);
  };

  let started = false;
  const run = () => {
    if (stopped || started) return;
    started = true;
    win.clearTimeout(fallbackTimer);
    const fonts = win.document.fonts?.ready ?? Promise.resolve();
    void Promise.resolve(fonts).then(
      () => {
        if (stopped) return;
        win.requestAnimationFrame(() => {
          if (stopped) return;
          win.requestAnimationFrame(() => {
            if (stopped) return;
            align();
            watchHeroReflow();
            if ('onscrollend' in win) {
              win.addEventListener('scrollend', settle, { once: true });
            }
            settleTimer = win.setTimeout(settle, 1200);
          });
        });
      },
      () => {
        if (!stopped) align();
      }
    );
  };

  if (win.document.readyState === 'complete') run();
  else {
    win.addEventListener('load', run, { once: true });
    fallbackTimer = win.setTimeout(run, LAYOUT_FALLBACK_MS);
  }

  return () => {
    stopped = true;
    win.clearTimeout(fallbackTimer);
    win.clearTimeout(settleTimer);
    win.clearTimeout(heroTimer);
    heroObserver?.disconnect();
    win.removeEventListener('load', run);
    win.removeEventListener('hashchange', onHashChange);
    win.removeEventListener('scrollend', settle);
    for (const type of userEvents) {
      win.removeEventListener(type, stopForUser, { capture: true });
    }
  };
}
