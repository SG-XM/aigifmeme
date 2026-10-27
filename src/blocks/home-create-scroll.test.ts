import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { HOME_CREATE_ELEMENT_ID } from '@/lib/home-create-scroll';

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
  usePathname: () => '/',
}));

function homepageHtml() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(HomeLanding, {
        voice: 'uptown',
        posts: [],
        heroVideos: [
          {
            id: 'demo',
            src: '/videos/demo.mp4',
            poster: '/videos/demo.jpg',
            title: 'Demo',
          },
        ],
        galleryVideos: [],
      })
    )
  );
}

describe('homepage create anchor', () => {
  it('renders the photo picker as #create, after the hero demos', () => {
    const html = homepageHtml();
    const demos = html.indexOf('home-hero-demos');
    const create = html.indexOf(`id="${HOME_CREATE_ELEMENT_ID}"`);

    expect(HOME_CREATE_ELEMENT_ID).toBe('create');
    expect(demos).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(demos);
    expect(html).toContain('id="create"');
    expect(html.slice(create, create + 80)).toContain('scroll-mt-24');
  });
});
