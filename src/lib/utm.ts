import { envConfigs } from '@/config';

/**
 * Tag an outbound link with `utm_source=<our hostname>` so partner sites can
 * attribute the traffic. Same-site paths are returned untouched, as is any URL
 * that already carries a `utm_source`.
 */
export function withUtmSource(href: string): string {
  if (!/^https?:\/\//i.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.searchParams.has('utm_source')) return href;

    let source = envConfigs.app_name;
    try {
      source = new URL(envConfigs.app_url).hostname || source;
    } catch {
      // Malformed app_url — fall back to the app name.
    }
    if (!source) return href;

    url.searchParams.set('utm_source', source);
    return url.toString();
  } catch {
    return href;
  }
}
