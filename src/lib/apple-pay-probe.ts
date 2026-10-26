import {
  clipJson,
  expressCheckoutHasApplePay,
  isRetryableStripeConnection,
  loadStripeClient,
  stripeErrorSummary,
} from '@/lib/apple-pay';

/**
 * One Express Checkout probe for the whole page.
 * Eleven pricing buttons each used to mount their own element while Stripe.js
 * was still loading. The per-button timer started only after `element.mount`,
 * and a cleanup before that returned without a note, so every HUD row stayed
 * on `stripe: loading`. This probe arms its timeout first, loads Stripe.js
 * once, and mounts one painted element. Express Checkout emits ready only
 * after that iframe renders, so the host stays visibility visible.
 */
export const APPLE_PAY_PROBE_TIMEOUT_MS = 3000;
export const APPLE_PAY_PROBE_CONNECTION_RETRIES = 3;

export const STRIPE_LOAD_TIMEOUT_NOTE = 'Stripe.js timed out while loading';
export const PROBE_READY_TIMEOUT_NOTE = 'probe timed out before ready';

/** 1s, then 2s, then 4s. `retryIndex` is how many connection retries already ran. */
export function applePayProbeRetryDelay(retryIndex: number) {
  return 1000 * 2 ** retryIndex;
}

export type ApplePayProbeSnapshot = {
  status: 'idle' | 'loading' | 'ready' | 'absent';
  attempt: number;
  applePay: boolean;
  stripe: string;
  note: string;
  methodsJson: string;
  changes: string[];
  errors: string[];
};

export type ApplePayProbeInput = {
  publishableKey: string;
  currency: string;
  amount: number;
  buttonType: 'buy' | 'subscribe';
};

const SERVER_SNAPSHOT: ApplePayProbeSnapshot = {
  status: 'idle',
  attempt: 0,
  applePay: false,
  stripe: 'not called',
  note: '',
  methodsJson: '(none)',
  changes: [],
  errors: [],
};

function idleSnapshot(attempt = 0): ApplePayProbeSnapshot {
  return {
    status: 'idle',
    attempt,
    applePay: false,
    stripe: 'not called',
    note: '',
    methodsJson: '(none)',
    changes: [],
    errors: [],
  };
}

let snapshot: ApplePayProbeSnapshot = idleSnapshot();
let retainers = 0;
let activeKey = '';
let phase: 'idle' | 'loading' | 'settled' = 'idle';
let generation = 0;
let locked = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let host: HTMLDivElement | null = null;
let unmountElement: (() => void) | undefined;
let activeMount = 0;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function publish(next: ApplePayProbeSnapshot) {
  snapshot = next;
  emit();
}

function clearTimer() {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
}

function clearRetry() {
  if (retryTimer === undefined) return;
  clearTimeout(retryTimer);
  retryTimer = undefined;
}

function invalidateMount() {
  activeMount += 1;
}

function unmountElementOnly() {
  const unmount = unmountElement;
  unmountElement = undefined;
  unmount?.();
}

function destroyHost() {
  unmountElementOnly();
  host?.remove();
  host = null;
}

function appendError(message: string) {
  if (snapshot.errors[snapshot.errors.length - 1] === message) {
    return snapshot.errors;
  }
  return [...snapshot.errors, message].slice(-5);
}

export function expressCheckoutElementOptions(buttonType: 'buy' | 'subscribe') {
  return {
    paymentMethods: {
      applePay: 'always' as const,
      googlePay: 'never' as const,
      link: 'never' as const,
      paypal: 'never' as const,
      amazonPay: 'never' as const,
      klarna: 'never' as const,
    },
    buttonType: { applePay: buttonType },
    buttonTheme: { applePay: 'black' as const },
    buttonHeight: 44,
    // overflow "never" is valid only when maxRows is 0. One column and
    // every wallet except Apple Pay set to never keeps a single button.
    layout: { maxColumns: 1, maxRows: 0, overflow: 'never' as const },
  };
}

export function subscribeApplePayProbe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getApplePayProbeSnapshot() {
  return snapshot;
}

export function getApplePayProbeServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function current(attempt: number) {
  return attempt === generation;
}

function fail(attempt: number, message: string) {
  if (!current(attempt) || locked) return;
  locked = true;
  invalidateMount();
  phase = 'settled';
  clearTimer();
  clearRetry();
  destroyHost();
  publish({
    status: 'absent',
    attempt,
    applePay: false,
    stripe: `error: ${message}`,
    note: message,
    methodsJson: snapshot.methodsJson,
    changes: snapshot.changes,
    errors: appendError(message),
  });
}

function applyAvailability(
  attempt: number,
  show: boolean,
  methodsJson: string,
  fromChange: boolean
) {
  if (!current(attempt) || locked) return;
  if (
    snapshot.status !== 'loading' &&
    snapshot.status !== 'ready' &&
    snapshot.status !== 'absent'
  ) {
    return;
  }
  invalidateMount();
  phase = 'settled';
  clearTimer();
  clearRetry();
  destroyHost();
  publish({
    status: show ? 'ready' : 'absent',
    attempt,
    applePay: show,
    stripe: 'ok (ready)',
    note: '',
    methodsJson,
    changes: fromChange
      ? [...snapshot.changes, methodsJson].slice(-5)
      : snapshot.changes,
    errors: snapshot.errors,
  });
}

function timeout(attempt: number) {
  if (!current(attempt) || locked || snapshot.status !== 'loading') return;
  const loaded = snapshot.stripe === 'ok' || snapshot.stripe.startsWith('ok ');
  const note = loaded ? PROBE_READY_TIMEOUT_NOTE : STRIPE_LOAD_TIMEOUT_NOTE;
  clearTimer();
  if (!loaded) {
    locked = true;
    invalidateMount();
    phase = 'settled';
    clearRetry();
    destroyHost();
  }
  publish({
    status: 'absent',
    attempt,
    applePay: false,
    stripe: loaded ? snapshot.stripe : `error: ${note}`,
    note,
    methodsJson: snapshot.methodsJson,
    changes: snapshot.changes,
    errors: loaded ? snapshot.errors : [...snapshot.errors, note].slice(-5),
  });
}

function probeHost() {
  const node = document.createElement('div');
  node.setAttribute('data-apple-pay', 'probe');
  node.setAttribute('aria-hidden', 'true');
  node.style.position = 'fixed';
  node.style.left = '0px';
  node.style.bottom = '0px';
  node.style.width = '160px';
  node.style.height = '44px';
  node.style.opacity = '1';
  node.style.visibility = 'visible';
  node.style.pointerEvents = 'none';
  node.style.zIndex = '-1';
  document.body.appendChild(node);
  return node;
}

async function run(input: ApplePayProbeInput) {
  const attempt = ++generation;
  locked = false;
  invalidateMount();
  clearTimer();
  clearRetry();
  destroyHost();
  let connectionRetries = 0;
  publish({
    status: 'loading',
    attempt,
    applePay: false,
    stripe: 'loading',
    note: '',
    methodsJson: '(none)',
    changes: [],
    errors: [],
  });
  timer = setTimeout(() => timeout(attempt), APPLE_PAY_PROBE_TIMEOUT_MS);
  try {
    const stripe = await loadStripeClient(input.publishableKey);
    if (!current(attempt) || locked) return;
    if (!stripe) {
      fail(attempt, 'Stripe.js returned null');
      return;
    }
    publish({ ...snapshot, stripe: 'ok' });
    if (typeof document === 'undefined') {
      fail(attempt, 'Apple Pay probe has no document');
      return;
    }

    const handleLoadFailure = (error: unknown, serial: number) => {
      if (serial !== activeMount || !current(attempt) || locked) return;
      const detail = stripeErrorSummary(error);
      if (
        isRetryableStripeConnection(error) &&
        connectionRetries < APPLE_PAY_PROBE_CONNECTION_RETRIES
      ) {
        const delay = applePayProbeRetryDelay(connectionRetries);
        connectionRetries += 1;
        invalidateMount();
        unmountElementOnly();
        clearTimer();
        publish({
          status: 'loading',
          attempt,
          applePay: false,
          stripe: 'ok',
          note: detail,
          methodsJson: snapshot.methodsJson,
          changes: snapshot.changes,
          errors: appendError(detail),
        });
        clearRetry();
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          mount();
        }, delay);
        return;
      }
      fail(attempt, detail);
    };

    const mount = () => {
      if (!current(attempt) || locked) return;
      const serial = ++activeMount;
      try {
        unmountElementOnly();
        const elements = stripe.elements({
          mode: 'payment',
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          paymentMethodCreation: 'manual',
        });
        const element = elements.create(
          'expressCheckout',
          expressCheckoutElementOptions(input.buttonType)
        );
        unmountElement = () => element.unmount();
        element.on('ready', (event) => {
          if (serial !== activeMount || !current(attempt) || locked) return;
          applyAvailability(
            attempt,
            expressCheckoutHasApplePay(event),
            clipJson(event.availablePaymentMethods),
            false
          );
        });
        element.on('availablepaymentmethodschange', (event) => {
          if (serial !== activeMount || !current(attempt) || locked) return;
          applyAvailability(
            attempt,
            expressCheckoutHasApplePay(event),
            clipJson(event.paymentMethods),
            true
          );
        });
        element.on('loaderror', (event) => {
          handleLoadFailure(event, serial);
        });
        if (!current(attempt) || locked || serial !== activeMount) return;
        if (!host?.isConnected) {
          host?.remove();
          host = probeHost();
        }
        element.mount(host);
        if (!current(attempt) || locked || snapshot.status !== 'loading')
          return;
        // The load timer already ran. Give the mounted iframe its own wait so a
        // slow Stripe.js download does not consume the ready timeout.
        clearTimer();
        timer = setTimeout(() => timeout(attempt), APPLE_PAY_PROBE_TIMEOUT_MS);
      } catch (error) {
        handleLoadFailure(error, serial);
      }
    };

    mount();
  } catch (error) {
    fail(attempt, stripeErrorSummary(error));
  }
}

function ensureProbe(input: ApplePayProbeInput) {
  if (activeKey === input.publishableKey && phase !== 'idle') return;
  activeKey = input.publishableKey;
  phase = 'loading';
  void run(input);
}

function cancel() {
  generation += 1;
  activeKey = '';
  phase = 'idle';
  locked = true;
  invalidateMount();
  clearTimer();
  clearRetry();
  destroyHost();
  publish(idleSnapshot(generation));
}

/**
 * Join the page probe. The first caller starts it. Later callers with the
 * same publishable key reuse the result, including while the first load is
 * still in flight. Amount and button type do not start another probe.
 */
export function retainApplePayProbe(input: ApplePayProbeInput) {
  retainers += 1;
  ensureProbe(input);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    retainers = Math.max(0, retainers - 1);
    if (retainers > 0) return;
    cancel();
  };
}

export function resetApplePayProbe() {
  retainers = 0;
  cancel();
  listeners.clear();
}
