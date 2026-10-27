import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AgentLayout } from './agent-layout';

vi.mock('@/core/auth/client', () => ({
  useSession: () => ({ data: null, isPending: true }),
}));

vi.mock('@/core/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => createElement('a', { href, className }, children),
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => '/library',
}));

vi.mock('@/paraglide/runtime.js', () => ({
  getLocale: () => 'en',
  locales: ['en', 'zh'],
  setLocale: () => undefined,
}));

vi.mock('@/paraglide/messages.js', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, prop) => () => (typeof prop === 'string' ? prop : ''),
    }
  ),
}));

describe('library header', () => {
  it('uses the homepage trend mark and uptown nav', () => {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        {
          client: new QueryClient({
            defaultOptions: { queries: { retry: false } },
          }),
        },
        createElement(AgentLayout, null, createElement('div'))
      )
    );

    expect(html).toContain('trend-header');
    expect(html).toContain('home.nav.how');
    expect(html).toContain('home.nav.create');
    expect(html).toContain('href="/#create"');
    expect(html).not.toContain('trend-effect-chips');
    expect(html).not.toContain('data-effect-chip');
    expect(html).not.toContain('trending.button');
    expect(html).not.toContain('landing.nav.create');
  });
});
