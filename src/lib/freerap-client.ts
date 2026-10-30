import { FREERAP_API_ORIGIN, parseFreerapTask } from '@/lib/dame-hombro';
import { freerapApiKey } from '@/lib/freerap-api-key';
import { respData, respErr } from '@/lib/resp';

export class FreerapConfigError extends Error {
  constructor() {
    super('Dame Hombro is not configured.');
    this.name = 'FreerapConfigError';
  }
}

export async function freerapFetch(
  url: string,
  init: { method: 'GET' | 'POST'; body?: string }
): Promise<Response> {
  const key = freerapApiKey();
  if (!key) throw new FreerapConfigError();
  const parsed = new URL(url);
  if (parsed.origin !== FREERAP_API_ORIGIN || parsed.protocol !== 'https:') {
    throw new Error('FreeRap URL refused');
  }
  return fetch(url, {
    method: init.method,
    redirect: 'error',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body,
    signal: AbortSignal.timeout(20_000),
  });
}

export async function proxyFreerap(
  upstream: Response,
  fallback = 'Unable to reach the video service'
): Promise<Response> {
  const payload = await upstream.json().catch(() => null);
  const parsed = parseFreerapTask(payload);
  if (parsed.ok && upstream.ok) {
    return respData(parsed.task, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const message = publicUpstreamMessage(
    parsed.ok ? fallback : parsed.message,
    fallback
  );
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const retry = upstream.headers.get('retry-after');
  if (retry && /^[0-9]{1,6}$/.test(retry)) headers.set('retry-after', retry);
  return respErr(message, { status: clientStatus(upstream.status), headers });
}

function clientStatus(status: number): number {
  if (
    status === 400 ||
    status === 402 ||
    status === 403 ||
    status === 404 ||
    status === 429
  ) {
    return status;
  }
  // A FreeRap auth failure is our key, not the visitor's session.
  return 502;
}

function publicUpstreamMessage(message: string, fallback: string): string {
  const trimmed = message.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!trimmed) return fallback;
  const key = freerapApiKey();
  if (key && trimmed.includes(key)) return fallback;
  if (/bearer\s+\S+/i.test(trimmed)) return fallback;
  return trimmed;
}
