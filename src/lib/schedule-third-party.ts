/**
 * Run a third-party loader after the window load event, during idle time.
 * A tap or keypress starts it immediately so engaged visits are still measured.
 * Returns a cancel function for effect cleanup.
 */
export function scheduleThirdParty(run: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let cancelled = false;
  let started = false;
  let idleId = 0;
  let timerId = 0;

  const invoke = () => {
    if (cancelled || started) return;
    started = true;
    window.removeEventListener('pointerdown', onInteract);
    window.removeEventListener('keydown', onInteract);
    run();
  };

  const queue = () => {
    if (cancelled || started) return;
    const ric = window.requestIdleCallback;
    if (typeof ric === 'function') {
      idleId = ric(() => invoke(), { timeout: 4000 });
      return;
    }
    timerId = window.setTimeout(invoke, 1500);
  };

  function onInteract() {
    if (idleId && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId);
    }
    if (timerId) window.clearTimeout(timerId);
    invoke();
  }

  if (document.readyState === 'complete') queue();
  else window.addEventListener('load', queue, { once: true });
  window.addEventListener('pointerdown', onInteract, {
    once: true,
    passive: true,
  });
  window.addEventListener('keydown', onInteract, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener('load', queue);
    window.removeEventListener('pointerdown', onInteract);
    window.removeEventListener('keydown', onInteract);
    if (idleId && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId);
    }
    if (timerId) window.clearTimeout(timerId);
  };
}
