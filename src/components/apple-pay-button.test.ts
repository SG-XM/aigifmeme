// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applePayMountDecision,
  expressCheckoutHasApplePay,
  isIphone,
  isRetryableStripeConnection,
  stripeErrorSummary,
} from '@/lib/apple-pay';
import {
  APPLE_PAY_PROBE_CONNECTION_RETRIES,
  applePayProbeRetryDelay,
  resetApplePayProbe,
} from '@/lib/apple-pay-probe';

import {
  APPLE_PAY_PROBE_TIMEOUT_MS,
  ApplePayButton,
  PayActionRow,
} from './apple-pay-button';

const walletHandlers = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: unknown) => void>> = {};
  return {
    handlers,
    elementsOptions: null as Record<string, unknown> | null,
    checkoutOptions: null as Record<string, unknown> | null,
    failLoad: null as Error | null,
    stripeNull: false,
    hangLoad: false,
    loads: 0,
    mounts: 0,
    unmounts: 0,
    reset() {
      for (const key of Object.keys(handlers)) delete handlers[key];
      this.elementsOptions = null;
      this.checkoutOptions = null;
      this.failLoad = null;
      this.stripeNull = false;
      this.hangLoad = false;
      this.loads = 0;
      this.mounts = 0;
      this.unmounts = 0;
    },
    emit(type: string, event: unknown) {
      for (const handler of handlers[type] ?? []) handler(event);
    },
  };
});

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: () => Promise.resolve(null),
}));

vi.mock('@/lib/apple-pay', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/apple-pay')>('@/lib/apple-pay');
  return {
    ...actual,
    loadStripeClient: () => {
      walletHandlers.loads += 1;
      if (walletHandlers.hangLoad) return new Promise(() => {});
      if (walletHandlers.failLoad) {
        return Promise.reject(walletHandlers.failLoad);
      }
      if (walletHandlers.stripeNull) return Promise.resolve(null);
      return Promise.resolve({
        elements(options: Record<string, unknown>) {
          walletHandlers.elementsOptions = options;
          return {
            update() {},
            create(_type: string, checkoutOptions: Record<string, unknown>) {
              walletHandlers.checkoutOptions = checkoutOptions;
              return {
                on(type: string, handler: (event: unknown) => void) {
                  (walletHandlers.handlers[type] ??= []).push(handler);
                  return this;
                },
                mount() {
                  walletHandlers.mounts += 1;
                },
                unmount() {
                  walletHandlers.unmounts += 1;
                },
              };
            },
          };
        },
      });
    },
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const config = {
  data: undefined as Record<string, string> | undefined,
};

vi.mock('@/hooks/use-public-config', () => ({
  usePublicConfig: () => ({ data: config.data }),
}));

function markup(
  props: Partial<{
    amount: number;
    currency: string;
  }> = {}
) {
  return renderToStaticMarkup(
    createElement(ApplePayButton, {
      amount: 1200,
      currency: 'usd',
      label: 'Basic',
      onPay: async () => undefined,
      ...props,
    })
  );
}

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('isIphone', () => {
  it('matches an iPhone user agent, including iOS browsers that are not Safari', () => {
    expect(isIphone(IPHONE_SAFARI)).toBe(true);
    expect(isIphone(IPHONE_CHROME)).toBe(true);
  });

  it('matches an iPhone that requested the desktop site', () => {
    expect(isIphone(MAC_SAFARI, 5, 'MacIntel')).toBe(true);
    expect(isIphone('Mozilla/5.0', 5, 'MacIntel')).toBe(true);
    vi.stubGlobal('navigator', {
      userAgent: MAC_SAFARI,
      maxTouchPoints: 5,
      platform: 'MacIntel',
    });
    expect(isIphone()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does not match desktop Safari, Android, or iPad', () => {
    expect(isIphone(MAC_SAFARI)).toBe(false);
    vi.stubGlobal('navigator', {
      userAgent: MAC_SAFARI,
      maxTouchPoints: 0,
      platform: 'MacIntel',
    });
    expect(isIphone()).toBe(false);
    vi.unstubAllGlobals();
    expect(isIphone(MAC_SAFARI, 0, 'MacIntel')).toBe(false);
    expect(isIphone(MAC_SAFARI, 1, 'MacIntel')).toBe(false);
    expect(isIphone(ANDROID_CHROME, 5, 'Linux armv8l')).toBe(false);
    expect(isIphone(IPAD_SAFARI, 5, 'iPad')).toBe(false);
    expect(isIphone('Mozilla/5.0 (X11; Linux x86_64)', 5, 'Linux x86_64')).toBe(
      false
    );
    expect(isIphone('')).toBe(false);
  });
});

describe('ApplePayButton visibility', () => {
  it('reserves no layout on the server, before the iPhone check', () => {
    config.data = {
      stripe_enabled: 'true',
      stripe_publishable_key: 'pk_test_visibility',
    };
    expect(markup()).toBe('');
    expect(markup({ currency: 'EUR' })).toBe('');
  });

  it('leaves the checkout button alone when the wallet is hidden', () => {
    config.data = {
      stripe_enabled: 'true',
      stripe_publishable_key: 'pk_test_visibility',
    };
    const html = renderToStaticMarkup(
      createElement(
        PayActionRow,
        null,
        createElement('button', { 'data-slot': 'button' }, 'Buy'),
        createElement(ApplePayButton, {
          amount: 1200,
          currency: 'usd',
          label: 'Basic',
          onPay: async () => undefined,
        })
      )
    );
    expect(html).toContain('flex-wrap');
    expect(html).toContain('>Buy<');
    expect(html).not.toContain('data-apple-pay');
    expect(html).not.toContain('min-h-');
    expect(html).not.toContain('min-w-');
  });

  it('stays hidden without a key, a positive amount, or a wallet currency', () => {
    config.data = {
      stripe_enabled: 'true',
      stripe_publishable_key: 'pk_test_visibility',
    };
    expect(markup({ amount: 0 })).toBe('');
    expect(markup({ amount: -1 })).toBe('');
    expect(markup({ currency: 'gbp' })).toBe('');

    config.data = {
      stripe_enabled: 'false',
      stripe_publishable_key: 'pk_test',
    };
    expect(markup()).toBe('');

    config.data = { stripe_enabled: 'true' };
    expect(markup()).toBe('');

    config.data = undefined;
    expect(markup()).toBe('');
  });
});

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

function inFlowChildren(row: Element) {
  return [...row.children].filter((node) => {
    const element = node as HTMLElement;
    return (
      !node.classList.contains('absolute') &&
      !node.classList.contains('fixed') &&
      element.style.position !== 'fixed'
    );
  });
}

function expectProbeKeepsPayButtonFullWidth(row: Element) {
  const probes = document.querySelectorAll('[data-apple-pay="probe"]');
  expect(probes).toHaveLength(1);
  const box = probes[0] as HTMLElement;
  expect(box.classList.contains('flex-1')).toBe(false);
  expect(box.classList.contains('opacity-0')).toBe(false);
  expect(box.classList.contains('invisible')).toBe(false);
  expect(box.className).not.toContain('opacity-0');
  expect(box.style.position).toBe('fixed');
  expect(box.style.visibility).toBe('visible');
  expect(box.style.opacity).toBe('1');
  expect(box.style.width).toBe('160px');
  expect(box.style.height).toBe('44px');
  expect(box.style.pointerEvents).toBe('none');
  expect(Number(box.style.zIndex)).toBeLessThan(0);
  expect(row.querySelector('[data-apple-pay]')).toBeNull();
  expect(inFlowChildren(row).map((node) => node.textContent)).toEqual(['Buy']);
  expect(
    [...row.children].some((node) => node.classList.contains('flex-1'))
  ).toBe(false);
  expect(walletHandlers.loads).toBe(1);
  expect(walletHandlers.mounts).toBe(1);
}

describe('PayActionRow with a live Express Checkout wallet', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    walletHandlers.reset();
    setUserAgent(MAC_SAFARI);
    localStorage.clear();
    resetApplePayProbe();
    window.history.pushState({}, '', '/');
  });

  async function renderRow(
    userAgent: string,
    publishableKey = 'pk_test_visibility'
  ) {
    setUserAgent(userAgent);
    config.data = {
      stripe_enabled: 'true',
      stripe_publishable_key: publishableKey,
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          PayActionRow,
          null,
          createElement('button', { 'data-slot': 'button' }, 'Buy'),
          createElement(ApplePayButton, {
            amount: 1200,
            currency: 'usd',
            label: 'Basic',
            onPay: async () => undefined,
          })
        )
      );
      await Promise.resolve();
    });
    const row = container.firstElementChild;
    if (!row) throw new Error('PayActionRow did not render');
    return row;
  }

  it('keeps the pay button full width until Express Checkout shows Apple Pay', async () => {
    const row = await renderRow(IPHONE_CHROME);

    expectProbeKeepsPayButtonFullWidth(row);
    expect(row.querySelector('[data-apple-pay="ready"]')).toBeNull();

    await act(async () => {
      walletHandlers.emit('availablepaymentmethodschange', {
        elementType: 'expressCheckout',
        paymentMethods: { applePay: { available: false } },
      });
    });

    expect(row.querySelector('[data-apple-pay]')).toBeNull();
    expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
      'Buy',
    ]);
    expect(row.children).toHaveLength(1);
  });

  it('gives Apple Pay a flex slot only after Express Checkout says it is available', async () => {
    const row = await renderRow(IPHONE_CHROME);

    expect(row.querySelector('[data-apple-pay="ready"]')).toBeNull();

    await act(async () => {
      walletHandlers.emit('ready', {
        elementType: 'expressCheckout',
        availablePaymentMethods: {
          amazonPay: false,
          applePay: true,
          googlePay: false,
          link: false,
          paypal: false,
          klarna: false,
        },
      });
    });

    const wallet = row.querySelector('[data-apple-pay="ready"]');
    expect(wallet?.classList.contains('flex-1')).toBe(true);
    expect(wallet?.classList.contains('absolute')).toBe(false);
    expect(wallet?.classList.contains('fixed')).toBe(false);
    expect((wallet as HTMLElement).style.visibility).toBe('');
    expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
    expect(walletHandlers.unmounts).toBe(1);
    expect(inFlowChildren(row)).toHaveLength(2);
    expect(walletHandlers.elementsOptions).toMatchObject({
      mode: 'payment',
      amount: 1200,
      currency: 'usd',
      paymentMethodCreation: 'manual',
    });
    expect(walletHandlers.checkoutOptions).toMatchObject({
      paymentMethods: { applePay: 'always' },
      layout: { maxColumns: 1, maxRows: 0, overflow: 'never' },
    });
  });

  it('does not mount a wallet on desktop Safari', async () => {
    const row = await renderRow(MAC_SAFARI);
    expect(row.children).toHaveLength(1);
    expect(row.textContent).toBe('Buy');
    expect(walletHandlers.handlers.ready).toBeUndefined();
  });

  it('drops the wallet when ready reports no Apple Pay', async () => {
    const row = await renderRow(IPHONE_CHROME);
    await act(async () => {
      walletHandlers.emit('ready', {
        elementType: 'expressCheckout',
        availablePaymentMethods: {
          amazonPay: false,
          applePay: false,
          googlePay: false,
          link: false,
          paypal: false,
          klarna: false,
        },
      });
    });
    expect(row.querySelector('[data-apple-pay]')).toBeNull();
    expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
      'Buy',
    ]);
    expect(walletHandlers.unmounts).toBeGreaterThan(0);
  });

  it('keeps the painted probe after the ready note so a late ready can show Apple Pay', async () => {
    vi.useFakeTimers();
    try {
      const row = await renderRow(IPHONE_CHROME);
      expectProbeKeepsPayButtonFullWidth(row);
      expect(walletHandlers.mounts).toBe(1);
      expect(walletHandlers.unmounts).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(APPLE_PAY_PROBE_TIMEOUT_MS);
      });

      expect(document.querySelector('[data-apple-pay="probe"]')).not.toBeNull();
      expect(row.querySelector('[data-apple-pay]')).toBeNull();
      expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
        'Buy',
      ]);
      expect(walletHandlers.unmounts).toBe(0);

      await act(async () => {
        walletHandlers.emit('ready', {
          elementType: 'expressCheckout',
          availablePaymentMethods: {
            amazonPay: false,
            applePay: true,
            googlePay: false,
            link: false,
            paypal: false,
            klarna: false,
          },
        });
      });

      expect(row.querySelector('[data-apple-pay="ready"]')).not.toBeNull();
      expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
      expect(inFlowChildren(row)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not time out after ready reports Apple Pay', async () => {
    vi.useFakeTimers();
    try {
      const row = await renderRow(IPHONE_CHROME);
      await act(async () => {
        walletHandlers.emit('ready', {
          elementType: 'expressCheckout',
          availablePaymentMethods: {
            amazonPay: false,
            applePay: true,
            googlePay: false,
            link: false,
            paypal: false,
            klarna: false,
          },
        });
        await vi.advanceTimersByTimeAsync(APPLE_PAY_PROBE_TIMEOUT_MS);
      });
      expect(row.querySelector('[data-apple-pay="ready"]')).not.toBeNull();
      expect(
        row
          .querySelector('[data-apple-pay="ready"]')
          ?.classList.contains('flex-1')
      ).toBe(true);
      expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
      expect(walletHandlers.unmounts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the wallet when Express Checkout fails to load', async () => {
    const row = await renderRow(IPHONE_CHROME);
    await act(async () => {
      walletHandlers.emit('loaderror', {
        elementType: 'expressCheckout',
        error: { type: 'invalid_request_error' },
      });
    });
    expect(row.children).toHaveLength(1);
    expect(row.textContent).toBe('Buy');
  });

  it('keeps the pay button full width until Apple Pay is available, then hides it when the wallet goes away', async () => {
    const row = await renderRow(IPHONE_CHROME);
    expectProbeKeepsPayButtonFullWidth(row);
    expect(walletHandlers.checkoutOptions).toMatchObject({
      paymentMethods: { applePay: 'always' },
      layout: { maxColumns: 1, maxRows: 0, overflow: 'never' },
    });

    await act(async () => {
      walletHandlers.emit('ready', {
        elementType: 'expressCheckout',
        availablePaymentMethods: {
          amazonPay: false,
          applePay: true,
          googlePay: false,
          link: false,
          paypal: false,
          klarna: false,
        },
      });
    });

    expect(
      row
        .querySelector('[data-apple-pay="ready"]')
        ?.classList.contains('flex-1')
    ).toBe(true);
    expect(inFlowChildren(row)).toHaveLength(2);

    await act(async () => {
      walletHandlers.emit('availablepaymentmethodschange', {
        elementType: 'expressCheckout',
        paymentMethods: { applePay: { available: false } },
      });
    });

    expect(row.querySelector('[data-apple-pay]')).toBeNull();
    expect(inFlowChildren(row)).toHaveLength(1);
  });

  it('drops the wallet when Stripe.js fails to load', async () => {
    walletHandlers.failLoad = new Error('stripe.js blocked');
    const row = await renderRow(IPHONE_CHROME);
    expect(row.querySelector('[data-apple-pay="ready"]')).toBeNull();
    expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
    expect(inFlowChildren(row)).toHaveLength(1);
  });

  const connectionError = {
    elementType: 'expressCheckout',
    error: {
      type: 'api_connection_error',
      message: '连接我们的支付服务商时出现了问题。请检查您的网络连接。',
    },
  };

  it('retries a connection error and still shows Apple Pay when the next mount is ready', async () => {
    vi.useFakeTimers();
    try {
      const row = await renderRow(IPHONE_CHROME);
      expect(walletHandlers.mounts).toBe(1);

      await act(async () => {
        walletHandlers.emit('loaderror', connectionError);
      });

      expect(document.querySelector('[data-apple-pay="probe"]')).not.toBeNull();
      expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
        'Buy',
      ]);
      expect(walletHandlers.mounts).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(applePayProbeRetryDelay(0));
      });
      expect(walletHandlers.mounts).toBe(2);
      expect(walletHandlers.loads).toBe(1);
      const probe = document.querySelector(
        '[data-apple-pay="probe"]'
      ) as HTMLElement | null;
      expect(probe?.style.visibility).toBe('visible');
      expect(probe?.style.opacity).toBe('1');

      await act(async () => {
        walletHandlers.emit('ready', {
          elementType: 'expressCheckout',
          availablePaymentMethods: {
            amazonPay: false,
            applePay: true,
            googlePay: false,
            link: false,
            paypal: false,
            klarna: false,
          },
        });
      });

      expect(row.querySelector('[data-apple-pay="ready"]')).not.toBeNull();
      expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a rate limit error before keeping the pay button full width', async () => {
    vi.useFakeTimers();
    try {
      const row = await renderRow(IPHONE_CHROME);
      await act(async () => {
        walletHandlers.emit('loaderror', {
          elementType: 'expressCheckout',
          error: { type: 'rate_limit_error', message: 'Too many requests' },
        });
      });
      expect(row.querySelector('[data-apple-pay="ready"]')).toBeNull();
      expect(document.querySelector('[data-apple-pay="probe"]')).not.toBeNull();
      expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
        'Buy',
      ]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(applePayProbeRetryDelay(0));
      });
      expect(walletHandlers.mounts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the wallet after the connection retries are exhausted', async () => {
    vi.useFakeTimers();
    try {
      const row = await renderRow(IPHONE_CHROME);

      for (
        let retry = 0;
        retry < APPLE_PAY_PROBE_CONNECTION_RETRIES;
        retry += 1
      ) {
        await act(async () => {
          walletHandlers.emit('loaderror', connectionError);
        });
        expect(
          document.querySelector('[data-apple-pay="probe"]')
        ).not.toBeNull();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(applePayProbeRetryDelay(retry));
        });
      }

      await act(async () => {
        walletHandlers.emit('loaderror', connectionError);
      });

      expect(walletHandlers.mounts).toBe(
        APPLE_PAY_PROBE_CONNECTION_RETRIES + 1
      );
      expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
      expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
        'Buy',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the wallet when Express Checkout reports a non-retryable load error', async () => {
    const row = await renderRow(IPHONE_CHROME);
    await act(async () => {
      walletHandlers.emit('loaderror', {
        elementType: 'expressCheckout',
        error: { message: 'domain is not verified' },
      });
    });
    expect(row.children).toHaveLength(1);
  });

  it('drops the wallet when Stripe.js returns null', async () => {
    walletHandlers.stripeNull = true;
    const row = await renderRow(IPHONE_CHROME);
    expect(row.children).toHaveLength(1);
  });

  it('shares one probe when two Apple Pay buttons mount', async () => {
    setUserAgent(IPHONE_CHROME);
    config.data = {
      stripe_enabled: 'true',
      stripe_publishable_key: 'pk_test_visibility',
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          'div',
          null,
          createElement(ApplePayButton, {
            amount: 1200,
            currency: 'usd',
            label: 'Basic',
            onPay: async () => undefined,
          }),
          createElement(ApplePayButton, {
            amount: 2400,
            currency: 'eur',
            label: 'Plus',
            onPay: async () => undefined,
          })
        )
      );
      await Promise.resolve();
    });
    expect(document.querySelectorAll('[data-apple-pay="probe"]')).toHaveLength(
      1
    );
    expect(walletHandlers.loads).toBe(1);
    expect(walletHandlers.mounts).toBe(1);
  });

  async function renderWallets(amounts: number[]) {
    setUserAgent(IPHONE_CHROME);
    config.data = {
      stripe_enabled: 'true',
      stripe_publishable_key: 'pk_test_visibility',
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const draw = (next: number[]) =>
      createElement(
        'div',
        null,
        ...next.map((amount, index) =>
          createElement(ApplePayButton, {
            amount,
            currency: index % 2 === 0 ? 'usd' : 'eur',
            label: `Plan ${index}`,
            buttonType: index % 2 === 0 ? 'buy' : 'subscribe',
            onPay: async () => undefined,
          })
        )
      );
    await act(async () => {
      root?.render(draw(amounts));
      await Promise.resolve();
    });
    return draw;
  }

  it('probes once for the whole pricing grid, then shows each real button', async () => {
    const amounts = [
      1200, 2400, 3600, 4800, 6000, 7200, 8400, 9600, 10800, 12000, 13200,
    ];
    await renderWallets(amounts);

    expect(document.querySelectorAll('[data-apple-pay="probe"]')).toHaveLength(
      1
    );
    expect(document.querySelectorAll('[data-apple-pay="ready"]')).toHaveLength(
      0
    );
    expect(walletHandlers.loads).toBe(1);
    expect(walletHandlers.mounts).toBe(1);
    expect(walletHandlers.checkoutOptions).toMatchObject({
      paymentMethods: { applePay: 'always' },
    });

    await act(async () => {
      walletHandlers.emit('ready', {
        elementType: 'expressCheckout',
        availablePaymentMethods: {
          amazonPay: false,
          applePay: true,
          googlePay: false,
          link: false,
          paypal: false,
          klarna: false,
        },
      });
      await Promise.resolve();
    });

    expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
    expect(document.querySelectorAll('[data-apple-pay="ready"]')).toHaveLength(
      amounts.length
    );
    expect(walletHandlers.checkoutOptions).toMatchObject({
      paymentMethods: { applePay: 'always' },
    });
  });

  it('does not restart Stripe.js when amounts change before ready', async () => {
    const draw = await renderWallets([1200, 2400, 3600]);
    expect(walletHandlers.loads).toBe(1);
    expect(walletHandlers.mounts).toBe(1);

    await act(async () => {
      root?.render(draw([1800, 3000, 4200]));
      await Promise.resolve();
    });

    expect(walletHandlers.loads).toBe(1);
    expect(walletHandlers.mounts).toBe(1);
    expect(walletHandlers.unmounts).toBe(0);
    expect(document.querySelectorAll('[data-apple-pay="probe"]')).toHaveLength(
      1
    );
  });

  it('drops the wallet when Stripe.js never finishes loading', async () => {
    vi.useFakeTimers();
    try {
      walletHandlers.hangLoad = true;
      const row = await renderRow(IPHONE_CHROME);
      expect(walletHandlers.loads).toBe(1);
      expect(walletHandlers.mounts).toBe(0);
      expect(row.querySelector('[data-apple-pay]')).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(APPLE_PAY_PROBE_TIMEOUT_MS);
      });

      expect(document.querySelector('[data-apple-pay="probe"]')).toBeNull();
      expect(inFlowChildren(row).map((node) => node.textContent)).toEqual([
        'Buy',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('applePayMountDecision', () => {
  it('mounts only an iPhone with a key, a wallet currency, and a positive amount', () => {
    expect(
      applePayMountDecision({
        iphone: true,
        publishableKey: 'pk_test_visibility',
        currency: 'USD',
        amount: 1200,
      })
    ).toEqual({ mount: true, reason: 'eligible' });
    expect(
      applePayMountDecision({
        iphone: false,
        publishableKey: 'pk_test_visibility',
        currency: 'usd',
        amount: 1200,
      }).reason
    ).toBe('not iphone');
    expect(
      applePayMountDecision({
        iphone: true,
        publishableKey: '',
        currency: 'usd',
        amount: 1200,
      }).reason
    ).toBe('no publishable key');
    expect(
      applePayMountDecision({
        iphone: true,
        publishableKey: 'pk_test_visibility',
        currency: 'gbp',
        amount: 1200,
      }).reason
    ).toBe('currency not usd or eur');
    expect(
      applePayMountDecision({
        iphone: true,
        publishableKey: 'pk_test_visibility',
        currency: 'eur',
        amount: 0,
      }).reason
    ).toBe('amount not positive');
  });
});

describe('expressCheckoutHasApplePay', () => {
  it('reads the ready event and ignores an empty method list', () => {
    expect(
      expressCheckoutHasApplePay({
        elementType: 'expressCheckout',
        availablePaymentMethods: undefined,
      })
    ).toBe(false);
    expect(
      expressCheckoutHasApplePay({
        elementType: 'expressCheckout',
        availablePaymentMethods: {
          amazonPay: false,
          applePay: true,
          googlePay: false,
          link: false,
          paypal: false,
          klarna: false,
        },
      })
    ).toBe(true);
  });

  it('requires applePay.available and ignores a truthy method object', () => {
    expect(
      expressCheckoutHasApplePay({
        elementType: 'expressCheckout',
        paymentMethods: {
          applePay: { available: false },
          googlePay: { available: true },
        },
      })
    ).toBe(false);
    expect(
      expressCheckoutHasApplePay({
        elementType: 'expressCheckout',
        paymentMethods: undefined,
      })
    ).toBe(false);
    expect(
      expressCheckoutHasApplePay({
        elementType: 'expressCheckout',
        paymentMethods: { applePay: { available: true } },
      })
    ).toBe(true);
  });
});

describe('stripe connection errors', () => {
  it('retries connection, rate limit, and lock timeout errors', () => {
    expect(
      isRetryableStripeConnection({
        error: { type: 'api_connection_error' },
      })
    ).toBe(true);
    expect(
      isRetryableStripeConnection({ error: { type: 'rate_limit_error' } })
    ).toBe(true);
    expect(
      isRetryableStripeConnection({ error: { code: 'lock_timeout' } })
    ).toBe(true);
    expect(
      isRetryableStripeConnection({ error: { type: 'invalid_request_error' } })
    ).toBe(false);
  });

  it('summarizes a Stripe error without printing a secret key', () => {
    expect(
      stripeErrorSummary({
        error: {
          type: 'api_connection_error',
          message: 'pk_test_51Abcdefghijk could not connect',
        },
      })
    ).toBe('api_connection_error: pk_test_51Ab… could not connect');
    expect(stripeErrorSummary({ message: 'domain is not verified' })).toBe(
      'domain is not verified'
    );
    expect(stripeErrorSummary(new Error('stripe.js blocked'))).toBe(
      'stripe.js blocked'
    );
    expect(stripeErrorSummary(new Error('bad sk_live_shortkey'))).not.toContain(
      'sk_live_shortkey'
    );
  });
});
