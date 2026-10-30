import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GONE_PATHS,
  goneResponse,
  isGonePath,
  isRetiredBlogSlug,
  normalizePublicPath,
  RETIRED_BLOG_SLUGS,
} from './gone-paths';

function routeFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...routeFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('normalizePublicPath', () => {
  it('strips locale prefixes, trailing slashes, queries, and hashes', () => {
    expect(normalizePublicPath('/zh/window-peeper/')).toBe('/window-peeper');
    expect(normalizePublicPath('/es/ai-video/window-peeper?x=1')).toBe(
      '/ai-video/window-peeper'
    );
    expect(normalizePublicPath('/ar/blog/im-so-sorry-photo-trend#top')).toBe(
      '/blog/im-so-sorry-photo-trend'
    );
    expect(normalizePublicPath('/zh')).toBe('/');
    expect(normalizePublicPath('/es/')).toBe('/');
    expect(normalizePublicPath('/AI-VIDEO')).toBe('/ai-video');
  });
});

describe('isGonePath', () => {
  it('matches every retired path and its locale prefixes', () => {
    for (const path of GONE_PATHS) {
      expect(isGonePath(path), path).toBe(true);
      expect(isGonePath(`${path}/`), path).toBe(true);
      for (const locale of ['zh', 'es', 'ar']) {
        expect(isGonePath(`/${locale}${path}`), `/${locale}${path}`).toBe(true);
      }
    }
  });

  it('keeps the live Uptown pages', () => {
    for (const path of [
      '/',
      '/zh',
      '/es/',
      '/ar',
      '/pricing',
      '/zh/pricing',
      '/dame-hombro',
      '/zh/dame-hombro',
      '/dame-hombro-ai',
      '/privacy-policy',
      '/terms-of-service',
      '/blog',
      '/es/blog',
      '/blog/what-is-uptown-funk-ai',
      '/zh/blog/how-to-make-uptown-funk-ai-video-from-one-photo',
      '/blog/ceo-uptown-funk-ai-meme-explained',
      '/ar/blog/uptown-funk-ai-tools-how-to-choose',
      '/create',
      '/wallpaper-peeper',
      '/zh/wallpaper-peeper',
      '/api/im-so-sorry',
      '/images/im-so-sorry/01-dream.jpg',
      '/werewolf',
      '/werewolf-ai',
      '/ai-video/werewolf',
      '/burning-bridges',
      '/ai-video-extra',
    ]) {
      expect(isGonePath(path), path).toBe(false);
    }
  });
});

describe('isRetiredBlogSlug', () => {
  it('lists the five retired articles and leaves the Uptown posts', () => {
    for (const slug of RETIRED_BLOG_SLUGS) {
      expect(isRetiredBlogSlug(slug)).toBe(true);
    }
    expect(isRetiredBlogSlug('what-is-uptown-funk-ai')).toBe(false);
    expect(isRetiredBlogSlug('uptown-funk-ai-tools-how-to-choose')).toBe(false);
  });
});

describe('goneResponse', () => {
  it('returns HTTP 410 without a redirect', () => {
    const response = goneResponse('GET');
    expect(response.status).toBe(410);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    const head = goneResponse('HEAD');
    expect(head.status).toBe(410);
    expect(head.body).toBeNull();
  });
});

describe('retired routes', () => {
  const pageRoutes = [
    'src/routes/burning-bridges-ai.tsx',
    'src/routes/window-peeper.tsx',
    'src/routes/window-peeper-ai.tsx',
    'src/routes/ai-video/window-peeper.tsx',
    'src/routes/im-so-sorry.tsx',
    'src/routes/bulin-47-ai.tsx',
    'src/routes/ai-video/index.tsx',
  ];

  it('serves campaign routes with the shared 410 handlers', () => {
    for (const file of pageRoutes) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain('goneRouteHandlers');
      expect(source, file).not.toContain('statusCode: 301');
      expect(source, file).not.toContain('redirect(');
    }
  });

  it('keeps /create pointing at the homepage generator', () => {
    const source = readFileSync('src/routes/(agent)/create.tsx', 'utf8');
    expect(source).toContain("hash: 'create'");
    expect(source).toContain('statusCode: 301');
  });

  it('requires a werewolf route file to use the 410 handlers', () => {
    for (const file of routeFiles('src/routes')) {
      const source = readFileSync(file, 'utf8');
      if (!/werewolf/i.test(source)) continue;
      expect(source, file).toContain('goneRouteHandlers');
    }
  });
});
