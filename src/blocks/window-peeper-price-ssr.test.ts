import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { HomeLanding } from './home-landing';

vi.mock('@/core/auth/client', () => ({
  useSession: () => ({ data: null, isPending: false }),
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
  usePathname: () => '/window-peeper',
}));

function heroHtml() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(HomeLanding, { campaign: 'peeper', posts: [] })
    )
  );
  return html.slice(html.indexOf('id="hero"'), html.indexOf('id="create"'));
}

describe('window peeper price HTML', () => {
  it('prints the Single sentence and comparison link before the generator', () => {
    const hero = heroHtml();
    expect(hero).toContain(
      'As of 2026-10-24, Bulin Single is $6.99 for 10 credits.'
    );
    expect(hero).toContain('trend-price-line');
    expect(hero).toContain(
      'href="/blog/window-peeper-ai-vs-windowpeeperai-2026"'
    );
    expect(hero).toContain(
      'Bulin vs WindowPeeperAI.com for Window Peeper (2026)'
    );
    expect(hero.indexOf('trend-price-line')).toBeLessThan(
      hero.indexOf('window-peeper-ai-vs-windowpeeperai-2026')
    );
    expect(hero).toContain('12-second 720p Mini Window Peeper');
    expect(hero).not.toContain('$9.99');
    expect(hero).not.toContain('$9.90');
    expect(hero.toLowerCase()).not.toMatch(/chatgpt|\bbest\b/);
  });
});
