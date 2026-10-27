/**
 * Public R2 custom domain for generation reference objects (bucket `bulin47ai`).
 *
 * Kie and Seedance download these with HTTP Range. A 206 response is required.
 * Worker static files under `/videos/...` on the site host do not answer Range
 * and must not be sent as `video_url`. Admin settings can replace a clip
 * without a deploy; an empty setting keeps the URL built here.
 */
export const PUBLIC_REFERENCE_MEDIA_BASE = 'https://media.uptownfunkai.video';

export function publicReferenceUrl(fileName: string): string {
  return `${PUBLIC_REFERENCE_MEDIA_BASE}/reference/${fileName}`;
}
