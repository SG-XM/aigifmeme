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
 * Workers `caches.default` keeps marketing HTML for up to a day. Asset hashes
 * rotate every deploy, so bump this when the HTML document shape changes (or
 * after any deploy that would 404 stale modulepreload targets). The ship token
 * cannot Zone.Cache Purge, so the key must move.
 */
export const MARKETING_HTML_CACHE_EPOCH = '9813a73';

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
  const path =
    url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname;
  // String keys stay stable across requests. A Request object picks up
  // per-request `cf` metadata in workerd, so put and the next match miss.
  const cacheUrl = new URL(path, url.origin);
  cacheUrl.hash = `v=${MARKETING_HTML_CACHE_EPOCH}`;
  return {
    cache: true,
    home: true,
    session: false,
    key: cacheUrl.href,
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
