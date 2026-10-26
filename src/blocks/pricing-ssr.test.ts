import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PublicCreditPack } from '@/lib/public-credit-packs';

import { Pricing } from './pricing';

vi.mock('@/core/auth/client', () => ({
  useSession: () => ({ data: null, isPending: false }),
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
    ApplePayButton: () => null,
  };
});

function pack(
  productId: string,
  name: string,
  priceInCents: number,
  credits: number
): PublicCreditPack {
  return {
    productId,
    name,
    description: '',
    priceInCents,
    currency: 'usd',
    credits,
    creditsValidDays: 0,
    sort: 0,
  };
}

const livePacks = [
  pack('single_v2', 'Single', 699, 10),
  pack('duo_v2', 'Duo', 1699, 50),
  pack('crew_v2', 'Crew', 9900, 350),
  pack('studio_pack_v2', 'Studio', 19900, 900),
  pack('label_v2', 'Label', 49900, 3000),
];

function markup(initialPacks?: PublicCreditPack[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(Pricing, {
        headingLevel: 1,
        placement: 'pricing',
        tone: 'cinematic',
        initialPacks,
      })
    )
  );
}

describe('pricing pack SSR', () => {
  it('prints live pack names, USD prices, and credit counts on the first render', () => {
    const html = markup(livePacks);
    expect(html).toContain('Single');
    expect(html).toContain('$6.99');
    expect(html).toContain('Duo');
    expect(html).toContain('$16.99');
    expect(html).toContain('Crew');
    expect(html).toContain('$99.00');
    expect(html).toContain('Studio');
    expect(html).toContain('$199.00');
    expect(html).toContain('Label');
    expect(html).toContain('$499.00');
    expect(html).toContain('10');
    expect(html).toContain('Single $6.99 10');
    expect(html).toContain('<button');
    expect(html).not.toContain('$9.99');
  });

  it('omits pack prices when the server did not supply a catalog', () => {
    const html = markup();
    expect(html).not.toContain('$6.99');
    expect(html).not.toContain('$16.99');
  });
});
