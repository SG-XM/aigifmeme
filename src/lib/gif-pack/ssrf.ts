const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.internal',
]);

function ipv4(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return null;
  return parts;
}

function isPrivateAddress(host: string): boolean {
  const v4 = ipv4(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v6 = host.toLowerCase();
  if (!v6.includes(':')) return false;
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80') ||
    v6.startsWith('::ffff:127.') ||
    v6.startsWith('::ffff:10.') ||
    v6.startsWith('::ffff:192.168.') ||
    v6.startsWith('::ffff:169.254.')
  );
}

/**
 * Admin-only provider base. HTTPS, no credentials, no private or metadata hosts.
 * DNS rebinding of a public name is not resolved here; redirects are refused at fetch time.
 */
export function assertPublicProviderBase(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('GIF pack provider base URL is invalid');
  }
  if (url.protocol !== 'https:') {
    throw new Error('GIF pack provider base URL must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('GIF pack provider base URL cannot include credentials');
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (
    !host ||
    BLOCKED_HOSTS.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    isPrivateAddress(host)
  ) {
    throw new Error('GIF pack provider base URL is not a public HTTPS host');
  }
  return url;
}

export function providerEditsUrl(base: string): string {
  const url = assertPublicProviderBase(base);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = `${path}/images/edits`;
  url.search = '';
  url.hash = '';
  return url.toString();
}
