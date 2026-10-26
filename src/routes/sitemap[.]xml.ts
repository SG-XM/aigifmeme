import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { AI_VIDEO_INDEX_PATH, WINDOW_PEEPER_PATH } from '@/lib/ai-video-paths';
import { SORRY_PAGE_UPDATED_AT } from '@/lib/im-so-sorry';
import { TREND_PAGE_UPDATED_AT } from '@/lib/trend-page-meta';
import { WINDOW_PEEPER_UPDATED_AT } from '@/lib/window-peeper-reference';
import {
  baseLocale,
  locales,
  localizeUrl,
  type Locale,
} from '@/paraglide/runtime.js';
import { imSoSorryGeoSitemapEntries } from '@/content/posts/im-so-sorry-geo';
import { windowPeeperGeoSitemapEntries } from '@/content/posts/window-peeper-geo';

const STATIC_PATHS = [
  '',
  '/pricing',
  '/blog',
  '/privacy-policy',
  '/terms-of-service',
  '/burning-bridges-ai',
  AI_VIDEO_INDEX_PATH,
  WINDOW_PEEPER_PATH,
  '/im-so-sorry',
];
// /bulin-47-ai uses the homepage canonical; private app/auth routes are omitted.

type Entry = {
  path: string;
  lastModified?: string;
  /** Omit to advertise every UI locale. Posts set the locales that have a body. */
  locales?: Locale[];
};

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!
  );
}

function lastModified(value: Date | string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function urlFor(path: string, locale: Locale): string {
  const baseUrl = envConfigs.app_url.replace(/\/+$/, '');
  return localizeUrl(`${baseUrl}${path || '/'}`, {
    locale,
  }).href;
}

function alternateLocales(entry: Entry): readonly Locale[] {
  return entry.locales ?? locales;
}

function xDefaultLocale(entry: Entry): Locale {
  const available = alternateLocales(entry);
  return available.includes(baseLocale)
    ? baseLocale
    : (available[0] ?? baseLocale);
}

function entryXml(entry: Entry, locale: Locale): string {
  const alternates = alternateLocales(entry)
    .map(
      (loc) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(loc)}" href="${escapeXml(urlFor(entry.path, loc))}"/>`
    )
    .join('\n');
  return [
    '  <url>',
    `    <loc>${escapeXml(urlFor(entry.path, locale))}</loc>`,
    alternates,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(urlFor(entry.path, xDefaultLocale(entry)))}"/>`,
    entry.lastModified ? `    <lastmod>${entry.lastModified}</lastmod>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const posts: Entry[] = [];
        try {
          const { listPublishedArticleSitemapEntries } =
            await import('@/modules/posts/service');
          const rows = await listPublishedArticleSitemapEntries();
          for (const post of rows) {
            if (post.locales.length === 0) continue;
            posts.push({
              path: `/blog/${encodeURIComponent(post.slug)}`,
              lastModified: lastModified(post.updatedAt ?? post.createdAt),
              locales: post.locales,
            });
          }
        } catch {
          // Static pages stay listed when the database is unreachable.
        }
        const listed = new Set(
          posts.map((post) => post.path.replace(/^\/blog\//, ''))
        );
        for (const article of [
          ...imSoSorryGeoSitemapEntries(),
          ...windowPeeperGeoSitemapEntries(),
        ]) {
          const encoded = encodeURIComponent(article.slug);
          if (listed.has(encoded) || listed.has(article.slug)) continue;
          posts.push({
            path: `/blog/${encoded}`,
            lastModified: lastModified(article.createdAt),
            locales: article.locales,
          });
        }

        const urls = locales.flatMap((locale) => {
          const entries = new Map<string, Entry>(
            STATIC_PATHS.map((path) => [
              path,
              {
                path,
                lastModified:
                  path === '' || path === '/burning-bridges-ai'
                    ? TREND_PAGE_UPDATED_AT
                    : path === AI_VIDEO_INDEX_PATH ||
                        path === WINDOW_PEEPER_PATH
                      ? WINDOW_PEEPER_UPDATED_AT
                      : path === '/im-so-sorry'
                        ? SORRY_PAGE_UPDATED_AT
                        : undefined,
              },
            ])
          );
          for (const post of posts) {
            if (post.locales?.includes(locale)) entries.set(post.path, post);
          }
          return [...entries.values()].map((entry) => entryXml(entry, locale));
        });

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          ...urls,
          '</urlset>',
          '',
        ].join('\n');

        return new Response(xml, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        });
      },
    },
  },
});
