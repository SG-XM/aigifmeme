import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { isGonePath } from '@/lib/gone-paths';
import { TREND_PAGE_UPDATED_AT } from '@/lib/trend-page-meta';
import {
  baseLocale,
  locales,
  localizeUrl,
  type Locale,
} from '@/paraglide/runtime.js';

const STATIC_PATHS = [
  '',
  '/pricing',
  '/blog',
  '/privacy-policy',
  '/terms-of-service',
].filter((path) => !isGonePath(path || '/'));
// Retired campaign URLs are omitted. Private app/auth routes stay omitted.

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
            const path = `/blog/${encodeURIComponent(post.slug)}`;
            if (isGonePath(path)) continue;
            posts.push({
              path,
              lastModified: lastModified(post.updatedAt ?? post.createdAt),
              locales: post.locales,
            });
          }
        } catch {
          // Static pages stay listed when the database is unreachable.
        }

        const urls = locales.flatMap((locale) => {
          const entries = new Map<string, Entry>(
            STATIC_PATHS.filter((path) => !isGonePath(path || '/')).map(
              (path) => [
                path,
                {
                  path,
                  lastModified: path === '' ? TREND_PAGE_UPDATED_AT : undefined,
                },
              ]
            )
          );
          for (const post of posts) {
            if (isGonePath(post.path)) continue;
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
