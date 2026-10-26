import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respErr } from '@/lib/resp';

/**
 * GET /api/storage/download?url=…&name=…
 *
 * The browser ignores an <a download> on a cross-origin href, so a generated
 * image hosted on the storage domain opens in a tab instead of saving. Stream
 * it back from our own origin with Content-Disposition instead.
 *
 * Only the configured storage domain and this app's own origin are allowed —
 * an open fetcher here would be an SSRF hole.
 */
function isAllowedSource(target: URL, allowedOrigins: string[]) {
  return allowedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === target.origin;
    } catch {
      return false;
    }
  });
}

function safeFilename(input: string | null, fallback: string) {
  const raw = (input || fallback).split(/[\\/]/).pop() || fallback;
  // Quotes and control chars would break the header; keep it boring.
  const cleaned = raw
    .replace(/["\r\n]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

async function GET({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 300,
    keyPrefix: 'download',
  });
  if (limited) return limited;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized');

  const { searchParams, origin } = new URL(request.url);
  const raw = searchParams.get('url');
  if (!raw) return respErr('Missing url');

  let target: URL;
  try {
    target = new URL(raw, origin);
  } catch {
    return respErr('Invalid url');
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return respErr('Invalid url');
  }

  const configs = await getAllConfigs();
  const allowed = [origin, configs.app_url, configs.r2_domain].filter(
    Boolean
  ) as string[];
  if (!isAllowedSource(target, allowed)) return respErr('Forbidden source');

  const upstream = await fetch(target.toString());
  if (!upstream.ok || !upstream.body) {
    return respErr(`Upstream returned ${upstream.status}`);
  }

  const filename = safeFilename(
    searchParams.get('name'),
    target.pathname.split('/').pop() || 'download'
  );

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type':
        upstream.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=600',
    },
  });
}

export const Route = createFileRoute('/api/storage/download')({
  server: { handlers: { GET } },
});
