import { describe, expect, it } from 'vitest';

import {
  hasSessionCookie,
  MARKETING_HTML_CACHE_EPOCH,
  MARKETING_HTML_CACHE_STORE_CONTROL,
  marketingHtmlCacheableResponse,
  marketingHtmlCacheDecision,
  marketingHtmlCacheStorageKey,
  marketingHtmlCacheToken,
  marketingHtmlStoreHeaders,
  scheduleEdgeCacheWrite,
} from './marketing-html-cache';

function request(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
  } = {}
) {
  return new Request(`https://uptownfunkai.video${path}`, {
    method: init.method,
    headers: init.headers,
  });
}

describe('marketing homepage cache', () => {
  it('caches anonymous document gets for each locale home', () => {
    for (const path of ['/', '/zh', '/es', '/ar', '/zh/']) {
      const decision = marketingHtmlCacheDecision(
        request(path, { headers: { accept: 'text/html' } })
      );
      expect(decision.cache, path).toBe(true);
      if (decision.cache) {
        const cached = new URL(decision.key);
        expect(cached.pathname).toBe(path === '/zh/' ? '/zh' : path);
        expect(cached.hash).toBe('');
        expect(cached.searchParams.get('v')).toBe(marketingHtmlCacheToken());
        expect(cached.searchParams.get('v')).toContain(
          MARKETING_HTML_CACHE_EPOCH
        );
        expect(decision.key.startsWith('https://uptownfunkai.video')).toBe(
          true
        );
      }
    }
  });

  it('moves the storage key when the build id changes', () => {
    const origin = 'https://uptownfunkai.video';
    const current = marketingHtmlCacheToken();
    const next = marketingHtmlCacheToken('build-b');
    expect(current).not.toBe(next);
    expect(marketingHtmlCacheStorageKey(origin, '/', current)).not.toBe(
      marketingHtmlCacheStorageKey(origin, '/', next)
    );
    expect(marketingHtmlCacheToken('build-b')).toBe(
      `${MARKETING_HTML_CACHE_EPOCH}.build-b`
    );
    expect(marketingHtmlCacheToken('')).toBe(MARKETING_HTML_CACHE_EPOCH);
    expect(marketingHtmlCacheToken('has space')).toBe(
      MARKETING_HTML_CACHE_EPOCH
    );
    expect(marketingHtmlCacheToken('a#b')).toBe(MARKETING_HTML_CACHE_EPOCH);
    const keyed = new URL(marketingHtmlCacheStorageKey(origin, '/zh/', next));
    expect(keyed.pathname).toBe('/zh');
    expect(keyed.searchParams.get('v')).toBe(
      `${MARKETING_HTML_CACHE_EPOCH}.build-b`
    );
    expect(keyed.hash).toBe('');
  });

  it('shares one entry across attribution queries', () => {
    const bare = marketingHtmlCacheDecision(request('/'));
    const tagged = marketingHtmlCacheDecision(
      request('/?utm_source=ads&utm_medium=cpc&refer=partner')
    );
    expect(bare.cache && tagged.cache).toBe(true);
    if (bare.cache && tagged.cache) {
      expect(tagged.key).toBe(bare.key);
    }
  });

  it('skips other routes, queries, sessions, and subresource fetches', () => {
    expect(marketingHtmlCacheDecision(request('/pricing')).cache).toBe(false);
    expect(marketingHtmlCacheDecision(request('/blog')).cache).toBe(false);
    expect(marketingHtmlCacheDecision(request('/?q=wolf')).cache).toBe(false);
    expect(
      marketingHtmlCacheDecision(request('/', { method: 'POST' })).cache
    ).toBe(false);
    expect(
      marketingHtmlCacheDecision(
        request('/', {
          headers: { cookie: 'better-auth.session_token=abc' },
        })
      )
    ).toEqual({ cache: false, home: true, session: true });
    expect(
      marketingHtmlCacheDecision(
        request('/', {
          headers: {
            cookie: '__Secure-better-auth.session_data=abc',
          },
        })
      ).cache
    ).toBe(false);
    expect(
      marketingHtmlCacheDecision(
        request('/', { headers: { authorization: 'Bearer secret' } })
      ).cache
    ).toBe(false);
    expect(
      marketingHtmlCacheDecision(
        request('/', {
          headers: {
            accept: 'text/html',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
          },
        })
      ).cache
    ).toBe(false);
    expect(
      marketingHtmlCacheDecision(
        request('/', { headers: { accept: 'application/json' } })
      ).cache
    ).toBe(false);
  });

  it('allows a browser document navigation and a curl-style accept', () => {
    expect(
      marketingHtmlCacheDecision(
        request('/', {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            cookie: 'PARAGLIDE_LOCALE=en; utm_source=ads',
          },
        })
      ).cache
    ).toBe(true);
    expect(
      marketingHtmlCacheDecision(request('/', { headers: { accept: '*/*' } }))
        .cache
    ).toBe(true);
  });

  it('detects session cookies without matching unrelated names', () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie('utm_source=better-auth.session_token')).toBe(
      false
    );
    expect(hasSessionCookie('better-auth.session_token=abc')).toBe(true);
  });

  it('stores only public html documents', () => {
    expect(
      marketingHtmlCacheableResponse(
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      )
    ).toBe(true);
    expect(
      marketingHtmlCacheableResponse(
        new Response('no', {
          status: 200,
          headers: {
            'content-type': 'text/html',
            'set-cookie': 'a=b',
          },
        })
      )
    ).toBe(false);
    expect(
      marketingHtmlCacheableResponse(new Response('', { status: 302 }))
    ).toBe(false);
  });

  it('stores a public document without cookies or vary', () => {
    const headers = new Headers({
      'content-type': 'text/html; charset=utf-8',
      vary: 'accept-encoding',
      pragma: 'no-cache',
    });
    headers.append('set-cookie', 'utm_source=ads');
    const stored = marketingHtmlStoreHeaders(headers);
    expect(stored.get('cache-control')).toBe(
      MARKETING_HTML_CACHE_STORE_CONTROL
    );
    expect(stored.get('x-html-cache')).toBe('HIT');
    expect(stored.get('content-type')).toContain('text/html');
    expect(stored.get('vary')).toBeNull();
    expect(stored.get('pragma')).toBeNull();
    expect(stored.getSetCookie()).toEqual([]);
  });

  it('hands the cache write to waitUntil when one is available', () => {
    const task = Promise.resolve();
    expect(scheduleEdgeCacheWrite(task, undefined)).toBe(false);
    let retained: Promise<unknown> | undefined;
    expect(
      scheduleEdgeCacheWrite(task, (promise) => {
        retained = promise;
      })
    ).toBe(true);
    expect(retained).toBe(task);
  });
});
