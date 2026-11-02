import { AsyncLocalStorage } from 'node:async_hooks';
import handler from '@tanstack/react-start/server-entry';

import { ensureRequestMessages } from './core/i18n/message-runtime';
import { getCookieFromHeader } from './lib/cookie';
import { goneResponse, isGonePath } from './lib/gone-paths';
import {
  MARKETING_HTML_CACHE_CONTROL,
  MARKETING_HTML_PRIVATE_CONTROL,
  marketingHtmlCacheableResponse,
  marketingHtmlCacheDecision,
  marketingHtmlHasContent,
  marketingHtmlIsCompleteDocument,
  marketingHtmlStoreHeaders,
  pickEdgeWaitUntil,
  scheduleEdgeCacheWrite,
} from './lib/marketing-html-cache';
import { isHiddenPublicPath } from './lib/public-page-visibility';
import { overwriteServerAsyncLocalStorage } from './paraglide/runtime.js';
import { paraglideMiddleware } from './paraglide/server.js';

// Initialize once before any requests arrive. The middleware's lazy async
// initialization can replace the store during concurrent cold-start requests,
// causing an in-flight localized render to fall back to the base locale.
overwriteServerAsyncLocalStorage(new AsyncLocalStorage());

// On Cloudflare Workers, stash the binding env (D1, ASSETS, …) on globalThis
// so synchronous code paths (e.g. the db() singleton with DATABASE_PROVIDER=d1)
// can reach bindings without threading the request context through every call.
// The specifier is kept non-literal so bundlers leave the import to runtime;
// outside workerd the import rejects and we just move on.
const CF_WORKERS_MODULE = 'cloudflare:workers';
let cfEnvPromise: Promise<void> | null = null;
let cfWaitUntil: ((promise: Promise<unknown>) => void) | null = null;

function ensureCloudflareEnv(): Promise<void> {
  if (!cfEnvPromise) {
    cfEnvPromise = import(/* @vite-ignore */ CF_WORKERS_MODULE)
      .then(
        (mod: {
          env?: unknown;
          waitUntil?: (promise: Promise<unknown>) => void;
        }) => {
          (globalThis as any).__CF_ENV__ = mod.env;
          if (typeof mod.waitUntil === 'function') {
            cfWaitUntil = (promise) => {
              mod.waitUntil!(promise);
            };
          }
        }
      )
      .catch(() => {
        // Not running on Cloudflare Workers — nothing to stash.
      });
  }
  return cfEnvPromise;
}

function requestWaitUntil(req: Request) {
  const waitUntil = (req as Request & { waitUntil?: unknown }).waitUntil;
  return typeof waitUntil === 'function'
    ? (waitUntil as (promise: Promise<unknown>) => void).bind(req)
    : undefined;
}

function contextWaitUntil(ctx: unknown) {
  if (!ctx || typeof ctx !== 'object' || !('waitUntil' in ctx)) return;
  const waitUntil = (ctx as { waitUntil?: unknown }).waitUntil;
  return typeof waitUntil === 'function'
    ? (waitUntil as (promise: Promise<unknown>) => void).bind(ctx)
    : undefined;
}

function edgeCache(): Cache | null {
  const storage = (globalThis as { caches?: { default?: Cache } }).caches;
  const cache = storage?.default;
  if (
    !cache ||
    typeof cache.match !== 'function' ||
    typeof cache.put !== 'function'
  ) {
    return null;
  }
  return cache;
}

// Custom server entry — wraps every request in Paraglide's middleware so
// getLocale() resolves per-request (AsyncLocalStorage) during SSR.
export default {
  async fetch(req: Request, _opts?: unknown, ctx?: unknown): Promise<Response> {
    // Retired campaign and blog URLs, including locale prefixes. This runs
    // before routing so a page route cannot answer 200 or 301 instead.
    if (isGonePath(new URL(req.url).pathname)) return goneResponse(req.method);
    if (isHiddenPublicPath(new URL(req.url).pathname)) {
      return new Response(req.method === 'HEAD' ? null : 'Not Found\n', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex',
        },
      });
    }

    await ensureCloudflareEnv();
    const decision = marketingHtmlCacheDecision(req);
    const cache = decision.cache ? edgeCache() : null;

    if (cache && decision.cache) {
      try {
        const hit = await cache.match(decision.key);
        if (hit && (await marketingHtmlHasContent(hit))) {
          const headers = new Headers(hit.headers);
          headers.set('Cache-Control', MARKETING_HTML_CACHE_CONTROL);
          headers.set('x-html-cache', 'HIT');
          return applyAttribution(
            req,
            new Response(req.method === 'HEAD' ? null : hit.body, {
              status: hit.status,
              statusText: hit.statusText,
              headers,
            })
          );
        }
      } catch {
        // A cache read failure still renders the page.
      }
    }

    let rendered = await paraglideMiddleware(req, async () => {
      await ensureRequestMessages();
      return handler.fetch(req);
    });
    // Read the document before deciding to cache it. A streaming shell can
    // otherwise be stored for a day with a title and no article.
    let documentHtml: string | null = null;
    if (
      decision.cache &&
      req.method === 'GET' &&
      rendered.status === 200 &&
      (rendered.headers.get('content-type') || '').includes('text/html')
    ) {
      documentHtml = await rendered.text();
      rendered = new Response(documentHtml, {
        status: rendered.status,
        statusText: rendered.statusText,
        headers: rendered.headers,
      });
    }
    const complete =
      documentHtml != null && marketingHtmlIsCompleteDocument(documentHtml);
    const cacheableDocument =
      decision.cache &&
      req.method === 'GET' &&
      complete &&
      marketingHtmlCacheableResponse(rendered);
    // Clone before attribution cookies are appended. The stored copy must not
    // carry Set-Cookie, or the edge cache will refuse it.
    const storeSnapshot = cache && cacheableDocument ? rendered.clone() : null;
    const response = applyAttribution(req, rendered);

    if (decision.home && (decision.session || !cacheableDocument)) {
      response.headers.set('Cache-Control', MARKETING_HTML_PRIVATE_CONTROL);
      if (documentHtml != null && !complete) {
        response.headers.set('x-html-cache', 'SKIP');
      }
    } else if (cacheableDocument) {
      response.headers.set('Cache-Control', MARKETING_HTML_CACHE_CONTROL);
      response.headers.set('x-html-cache', storeSnapshot ? 'MISS' : 'BYPASS');
    }

    if (cache && decision.cache && storeSnapshot) {
      // TanStack Start calls this fetch with the request only. Nitro's
      // Worker entry does the same (`nitroApp.fetch(request)`), so the
      // third argument is not the Workers execution context. A floating
      // `cache.put` is canceled when the response is returned, and the
      // next anonymous GET stays `x-html-cache: MISS`.
      const put = cache
        .put(
          decision.key,
          new Response(storeSnapshot.body, {
            status: storeSnapshot.status,
            statusText: storeSnapshot.statusText,
            headers: marketingHtmlStoreHeaders(storeSnapshot.headers),
          })
        )
        .catch((error: unknown) => {
          console.error(
            'marketing html cache put failed',
            error instanceof Error ? error.message : 'unknown'
          );
        });
      const retained = scheduleEdgeCacheWrite(
        put,
        pickEdgeWaitUntil([
          cfWaitUntil,
          requestWaitUntil(req),
          contextWaitUntil(ctx),
        ])
      );
      if (!retained) await put;
    }

    return response;
  },
};

function applyAttribution(req: Request, response: Response) {
  const url = new URL(req.url);
  const cookieHeader = req.headers.get('cookie');
  const attributionParams = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ] as const;
  const cookieAttrs = 'Max-Age=2592000; Path=/; SameSite=Lax';

  // Keep the first touch for each attribution field so internal navigation
  // and later campaigns do not overwrite the source that brought the user.
  for (const name of attributionParams) {
    const value = (
      url.searchParams.get(name) ||
      (name === 'utm_source' ? url.searchParams.get('refer') : null)
    )?.trim();
    if (!value || getCookieFromHeader(cookieHeader, name)) continue;

    const sanitized = value.replace(/[^\p{L}\p{N} .:_-]/gu, '').slice(0, 100);
    if (sanitized) {
      response.headers.append(
        'Set-Cookie',
        `${name}=${encodeURIComponent(sanitized)}; ${cookieAttrs}`
      );
    }
  }

  if (!getCookieFromHeader(cookieHeader, 'utm_referrer')) {
    const referrer = req.headers.get('referer');
    if (referrer) {
      try {
        const referrerUrl = new URL(referrer);
        if (referrerUrl.hostname !== url.hostname) {
          const host = referrerUrl.hostname
            .replace(/[^\p{L}\p{N}.-]/gu, '')
            .slice(0, 253);
          if (host) {
            response.headers.append(
              'Set-Cookie',
              `utm_referrer=${encodeURIComponent(host)}; ${cookieAttrs}`
            );
          }
        }
      } catch {
        // Ignore malformed Referer headers.
      }
    }
  }
  return response;
}
