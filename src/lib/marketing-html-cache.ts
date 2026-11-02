import { MARKETING_HTML_CACHE_BUILD_ID } from './marketing-html-cache-build-id';

/**
 * Anonymous marketing homepages are the same HTML for every visitor.
 * Session state is hydrated in the browser, so these documents can sit in
 * the Workers cache. Signed-in requests skip the cache.
 *
 * Browser freshness is short (`max-age`). The shared cache keeps a copy for
 * a day (`s-maxage`), matching the blog pages.
 */

export const MARKETING_HTML_CACHE_CONTROL =
  'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400';

/** Stored on the edge object. Shared caches honor `s-maxage`. */
export const MARKETING_HTML_CACHE_STORE_CONTROL =
  'public, max-age=86400, s-maxage=86400';

export const MARKETING_HTML_PRIVATE_CONTROL = 'private, no-store';

/**
 * Workers `caches.default` keeps marketing HTML for up to a day and survives
 * deploys. Vite asset hashes rotate every build. The ship token cannot
 * Zone.Cache Purge, so a stale document keeps modulepreloading CSS/JS that
 * 404 until this key changes.
 *
 * `MARKETING_HTML_CACHE_EPOCH` is the manual floor (bump it to drop every
 * colo at once). `pnpm cf:build` / `pnpm cf:deploy` also append a build id
 * (`scripts/cf-build.sh`, `scripts/cf-deploy.sh`) so the next asset-hash
 * rotation misses this entry without another hand edit.
 *
 * The token is the `v` query param. Fragments are not a stable Cache API
 * key: workerd still forwards them, and cache.c++ calls that out as a bug
 * that would drop them. Query strings are part of the key (`ignoreSearch`
 * is unsupported).
 */
export const MARKETING_HTML_CACHE_EPOCH = '20261102a';

/**
 * Homepage HTML is worth caching only when the article actually rendered.
 * A Workers SSR crash (for example pdf-lib failing to evaluate) used to
 * store the shell — title and JSON-LD, no H1 — for a day.
 */
export function marketingHtmlIsCompleteDocument(html: string): boolean {
  return /<h1[\s>]/i.test(html) && /<\/html>/i.test(html);
}

const CACHE_KEY_PART = /^[A-Za-z0-9._-]{1,80}$/;

/** Epoch, plus the cf:build id when this bundle was produced for Workers. */
export function marketingHtmlCacheToken(
  buildId = MARKETING_HTML_CACHE_BUILD_ID
): string {
  if (!CACHE_KEY_PART.test(buildId)) return MARKETING_HTML_CACHE_EPOCH;
  return `${MARKETING_HTML_CACHE_EPOCH}.${buildId}`;
}

/**
 * Synthetic `caches.default` key. This is not the visitor URL. String keys
 * stay stable across requests; a Request object picks up per-request `cf`
 * metadata in workerd, so put and the next match miss.
 */
export function marketingHtmlCacheStorageKey(
  origin: string,
  pathname: string,
  token = marketingHtmlCacheToken()
): string {
  const path =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname || '/';
  const cacheUrl = new URL(path, origin);
  cacheUrl.searchParams.set('v', token);
  return cacheUrl.href;
}

const LOCALES = ['zh', 'es', 'ar'] as const;

const ATTRIBUTION_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'refer',
]);

const SESSION_COOKIE =
  /(?:^|;\s*)(?:__Host-|__Secure-)?better-auth\.session_(?:token|data)=/;

export function isMarketingHomePath(pathname: string): boolean {
  if (pathname === '/') return true;
  return LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname === `/${locale}/`
  );
}

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return SESSION_COOKIE.test(cookieHeader);
}

function acceptsHtml(accept: string | null): boolean {
  if (!accept) return true;
  return accept.includes('text/html') || accept.includes('*/*');
}

export type MarketingHtmlCacheDecision =
  | { cache: false; home: boolean; session: boolean }
  | { cache: true; home: true; session: false; key: string };

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Full document navigations of `/`, `/zh`, `/es`, and `/ar`.
 * Attribution query params share one cache entry. Any other query, a session
 * cookie, or a non-document fetch skips the cache.
 */
export function marketingHtmlCacheDecision(
  request: Request
): MarketingHtmlCacheDecision {
  const url = new URL(request.url);
  const home = isMarketingHomePath(url.pathname);
  const session = hasSessionCookie(request.headers.get('cookie'));
  if (!home) return { cache: false, home: false, session };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return { cache: false, home: true, session };
  }
  if (session || request.headers.get('authorization')) {
    return { cache: false, home: true, session };
  }
  for (const key of url.searchParams.keys()) {
    if (!ATTRIBUTION_PARAMS.has(key)) {
      return { cache: false, home: true, session: false };
    }
  }
  const dest = request.headers.get('sec-fetch-dest');
  if (dest && dest !== 'document') {
    return { cache: false, home: true, session: false };
  }
  const mode = request.headers.get('sec-fetch-mode');
  if (mode && mode !== 'navigate') {
    return { cache: false, home: true, session: false };
  }
  if (!acceptsHtml(request.headers.get('accept'))) {
    return { cache: false, home: true, session: false };
  }
  return {
    cache: true,
    home: true,
    session: false,
    key: marketingHtmlCacheStorageKey(url.origin, url.pathname),
  };
}

export function responseSetsCookie(response: Response): boolean {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().length > 0;
  }
  return response.headers.has('set-cookie');
}

/**
 * Headers stored in `caches.default`. `Set-Cookie` makes the put a no-op,
 * and `Vary` is matched against the lookup request — a headerless key would
 * miss a document that varies on `Accept-Encoding`.
 */
export function marketingHtmlStoreHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (
      lower === 'set-cookie' ||
      lower === 'vary' ||
      lower === 'cdn-cache-control' ||
      lower === 'cloudflare-cdn-cache-control' ||
      lower === 'pragma'
    ) {
      return;
    }
    headers.append(name, value);
  });
  headers.set('Cache-Control', MARKETING_HTML_CACHE_STORE_CONTROL);
  headers.set('x-html-cache', 'HIT');
  headers.delete('set-cookie');
  headers.delete('vary');
  return headers;
}

export function pickEdgeWaitUntil(
  candidates: Array<WaitUntil | null | undefined>
): WaitUntil | undefined {
  return candidates.find((candidate): candidate is WaitUntil => {
    return typeof candidate === 'function';
  });
}

/** Returns false when the caller must await the write itself. */
export function scheduleEdgeCacheWrite(
  task: Promise<unknown>,
  waitUntil: WaitUntil | undefined
): boolean {
  if (!waitUntil) return false;
  waitUntil(task);
  return true;
}

export function marketingHtmlCacheableResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return false;
  if (responseSetsCookie(response)) return false;
  return true;
}
