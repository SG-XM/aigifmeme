import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Pricing } from './pricing';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));

vi.mock('@/core/auth/client', () => ({
  useSession: () => ({
    data: session.user ? { user: session.user } : null,
    isPending: false,
  }),
}));

vi.mock('@/core/i18n/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => '/pricing',
}));

vi.mock('@/paraglide/runtime.js', () => ({
  getLocale: () => 'en',
}));

vi.mock('@/paraglide/messages.js', () => ({
  m: new Proxy(
    {},
    {
      get: () => (values?: Record<string, unknown>) =>
        values ? Object.values(values).join(' ') : 'label',
    }
  ),
}));

vi.mock('@/components/apple-pay-button', async () => {
  const { createElement: h } = await import('react');
  return {
    PayActionRow: ({ children }: { children: ReactNode }) =>
      h('div', null, children),
    ApplePayButton: ({
      amount,
      currency,
    }: {
      amount: number;
      currency: string;
    }) =>
      h('div', {
        'data-apple-pay': 'offered',
        'data-amount': String(amount),
        'data-currency': currency,
      }),
  };
});

function plan(
  productId: string,
  name: string,
  priceInCents: number,
  currency = 'usd'
) {
  return {
    productId,
    name,
    description: '',
    features: [] as string[],
    badge: '',
    priceInCents,
    compareAtPriceInCents: null,
    currency,
    interval: 'month' as const,
    intervalCount: 1,
    credits: 100,
    creditsValidDays: 30,
    featured: productId === 'basic_monthly_v2',
    sort: 1,
  };
}

function pack(productId: string, name: string, priceInCents: number) {
  return {
    productId,
    name,
    description: '',
    priceInCents,
    currency: 'usd',
    credits: 10,
    creditsValidDays: 0,
  };
}

async function markup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ['subscription-plans', 'en'],
    [plan('basic_monthly_v2', 'Basic', 2990), plan('free_v2', 'Free', 0)]
  );
  client.setQueryData(
    ['credit-top-up-products', 'en'],
    [pack('single_v2', 'Single', 999), pack('duo_v2', 'Duo', 0)]
  );
  client.setQueryData(['public-config'], {});
  const stream = await renderToReadableStream(
    createElement(
      QueryClientProvider,
      { client },
      createElement(Pricing, { compact: true })
    )
  );
  await stream.allReady;
  return new Response(stream).text();
}

describe('pricing walletAction', () => {
  it('offers Apple Pay for a positive price while logged out', async () => {
    session.user = null;
    const html = await markup();
    expect(html).toContain('Basic');
    expect(html).toContain('$29.90');
    expect(html).toContain('$9.99');
    expect(html).toContain('data-amount="2990"');
    expect(html).toContain('data-currency="usd"');
    expect(html).toContain('data-amount="999"');
    expect(html).not.toContain('data-amount="0"');
  });

  it('still offers Apple Pay after sign-in', async () => {
    session.user = { id: 'user_1' };
    const html = await markup();
    expect(html).toContain('data-amount="2990"');
    expect(html).toContain('data-amount="999"');
    expect(html).not.toContain('data-amount="0"');
  });
});
