import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import server from './server';

const render = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: render },
}));
vi.mock('./core/i18n/message-runtime', () => ({
  ensureRequestMessages: async () => {},
}));
vi.mock('./paraglide/runtime.js', () => ({
  overwriteServerAsyncLocalStorage: vi.fn(),
}));
vi.mock('./paraglide/server.js', () => ({
  paraglideMiddleware: (_request: Request, next: () => Promise<Response>) =>
    next(),
}));

const complete =
  '<html><body><main data-filemeta-home="true"><h1>Metadata Remover</h1><p>Document properties stay local.</p></main></body></html>';
const fallback =
  '<html><body><!--$!--><template></template><!--/$--></body></html>';
const document = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/html' } });

describe('homepage cache response path', () => {
  const match = vi.fn();
  const put = vi.fn();

  beforeEach(() => {
    render.mockReset();
    match.mockReset();
    put.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('caches', { default: { match, put } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides localized pricing URLs before rendering or accessing the cache', async () => {
    for (const prefix of ['', '/zh', '/es', '/ar']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await server.fetch(
          new Request(`https://filemetawipe.com${prefix}/pricing`, { method })
        );
        expect(response.status).toBe(404);
        expect(response.headers.get('x-robots-tag')).toBe('noindex');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        if (method === 'HEAD') expect(response.body).toBeNull();
      }
    }
    expect(render).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('replaces a cached 200 fallback with complete server-rendered HTML', async () => {
    match.mockResolvedValue(document(fallback));
    render.mockResolvedValue(document(complete));
    const response = await server.fetch(
      new Request('https://filemetawipe.com/')
    );
    expect(render).toHaveBeenCalledOnce();
    expect(await response.text()).toBe(complete);
    expect(response.headers.get('x-html-cache')).toBe('MISS');
    expect(put).toHaveBeenCalledOnce();
    expect(await put.mock.calls[0][1].text()).toBe(complete);
  });

  it('keeps a failed render out of both the edge cache and downstream shared caches', async () => {
    match.mockResolvedValue(undefined);
    render.mockResolvedValue(document(fallback));
    const response = await server.fetch(
      new Request('https://filemetawipe.com/')
    );
    expect(await response.text()).toBe(fallback);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(put).not.toHaveBeenCalled();
  });

  it('serves a complete cache hit without rendering again', async () => {
    match.mockResolvedValue(document(complete));
    const response = await server.fetch(
      new Request('https://filemetawipe.com/zh')
    );
    expect(await response.text()).toBe(complete);
    expect(response.headers.get('x-html-cache')).toBe('HIT');
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('bypasses the shared cache for authenticated requests', async () => {
    render.mockResolvedValue(document(complete));
    const response = await server.fetch(
      new Request('https://filemetawipe.com/', {
        headers: { cookie: 'better-auth.session_token=example' },
      })
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
