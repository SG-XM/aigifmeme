/**
 * What the chat, the preview pane and the library are willing to display.
 *
 * The agent generates clips, but a conversation also carries the stills a
 * user uploaded as an opening frame — so both kinds flow through the same
 * lists, and each render site asks here which element to reach for.
 */

const VIDEO_EXT_RE = /\.(?:mp4|webm|mov|m4v)\b/i;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg)\b/i;

export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:video/')) return true;
  return VIDEO_EXT_RE.test(url);
}

export function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  return IMAGE_EXT_RE.test(url);
}

/**
 * Whether a URL names something we can put on screen. Anything else in a tool
 * result — a JSON blob, a log line, a bare id — is not media and must not be
 * surfaced as if it were.
 */
export function isDisplayableMediaUrl(url: string): boolean {
  return isVideoUrl(url) || isImageUrl(url);
}

/**
 * The file name to show and to download as. Storage URLs put the real name in
 * a `path` query parameter, so that wins over the pathname when present.
 */
export function mediaNameFromUrl(src: string): string {
  try {
    const base =
      typeof window === 'undefined'
        ? 'http://localhost'
        : window.location.origin;
    const url = new URL(src, base);
    const path = url.searchParams.get('path') || url.pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
  } catch {
    return (
      src
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[?#].*$/, '') || ''
    );
  }
}
