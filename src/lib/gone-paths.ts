/**
 * Retired campaign and blog URLs. Document requests for these paths return
 * HTTP 410 from `src/server.ts` (including `/zh`, `/es`, and `/ar` prefixes).
 * Sitemap, llms.txt, and public blog queries use the same list.
 *
 * No Werewolf page is registered. An unregistered path stays 404; add it
 * here only when a route file still matches it.
 *
 * Campaign, peeper, and agent pages are unregistered and return 404.
 * Retired blog slugs stay 410 so those articles are not rendered.
 */

const LOCALE_PREFIX = /^\/(zh|es|ar)(?=\/|$)/i;

export const GONE_PATHS = [
  '/pdf-metadata-remover',
  '/blog/im-so-sorry-filter-tiktok',
  '/blog/im-so-sorry-photo-trend',
  '/blog/im-so-sorry-photo-trend-download',
  '/blog/window-peeper-ai-pricing-2026',
  '/blog/window-peeper-ai-vs-windowpeeperai-2026',
] as const;

const GONE_PATH_SET = new Set<string>(GONE_PATHS);

export const RETIRED_BLOG_SLUGS = [
  'im-so-sorry-filter-tiktok',
  'im-so-sorry-photo-trend',
  'im-so-sorry-photo-trend-download',
  'window-peeper-ai-pricing-2026',
  'window-peeper-ai-vs-windowpeeperai-2026',
] as const;

const RETIRED_BLOG_SLUG_SET = new Set<string>(RETIRED_BLOG_SLUGS);

/** Locale-free path with query, hash, and a trailing slash removed. */
export function normalizePublicPath(input: string): string {
  const raw = input.trim();
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      path = raw;
    }
  } else {
    path = raw.split(/[?#]/)[0] || '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const locale = path.match(LOCALE_PREFIX);
  if (locale) {
    path = path.slice(locale[0].length) || '/';
    if (!path.startsWith('/')) path = `/${path}`;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path when the escape sequence is invalid.
  }
  path = path.toLowerCase();
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

export function isGonePath(pathname: string): boolean {
  return GONE_PATH_SET.has(normalizePublicPath(pathname));
}

export function isRetiredBlogSlug(slug: string): boolean {
  const clean = slug.trim().toLowerCase();
  return RETIRED_BLOG_SLUG_SET.has(clean) || isGonePath(`/blog/${clean}`);
}

export function goneResponse(method = 'GET'): Response {
  const head = method.toUpperCase() === 'HEAD';
  return new Response(head ? null : 'Gone\n', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function goneHandler({ request }: { request: Request }): Response {
  return goneResponse(request.method);
}

/** Server handlers for a retired page route. No React render. */
export const goneRouteHandlers = {
  GET: goneHandler,
  HEAD: goneHandler,
  POST: goneHandler,
  PUT: goneHandler,
  PATCH: goneHandler,
  DELETE: goneHandler,
};
