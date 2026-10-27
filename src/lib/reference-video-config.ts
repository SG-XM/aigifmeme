/**
 * Admin Settings keys for Create reference clips.
 *
 * Stored as plain public URLs (never API keys). On save, each non-empty value
 * must be an https MP4 that answers `Range: bytes=0-1` with HTTP 206.
 * Create prefers these values and falls back to the code constants when unset.
 *
 * Precedence for a crew job:
 * - 12s: `create_reference_video_url_12s`, then `create_reference_video_url`,
 *   then the built-in 12s clip
 * - 15s: `create_reference_video_url_15s`, then `create_reference_video_url`,
 *   then the built-in 15s clip
 * Solo jobs read `create_reference_video_url`, then the built-in freestyle clip.
 * The Uptown homepage enqueues a crew job, so the default key swaps that clip
 * when the length-specific field is empty.
 */

export const CREATE_REFERENCE_VIDEO_URL = 'create_reference_video_url';
export const CREATE_REFERENCE_VIDEO_URL_12S = 'create_reference_video_url_12s';
export const CREATE_REFERENCE_VIDEO_URL_15S = 'create_reference_video_url_15s';

export const CREATE_REFERENCE_VIDEO_CONFIG_KEYS = [
  CREATE_REFERENCE_VIDEO_URL,
  CREATE_REFERENCE_VIDEO_URL_12S,
  CREATE_REFERENCE_VIDEO_URL_15S,
] as const;

export type CreateReferenceVideoConfigKey =
  (typeof CREATE_REFERENCE_VIDEO_CONFIG_KEYS)[number];

const PRIVATE_HOST =
  /^(?:localhost|.*\.localhost|.*\.local|metadata\.google\.internal|0\.0\.0\.0|::1|\[::1\]|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})$/i;

export function isCreateReferenceVideoConfigKey(
  name: string
): name is CreateReferenceVideoConfigKey {
  return (CREATE_REFERENCE_VIDEO_CONFIG_KEYS as readonly string[]).includes(
    name
  );
}

export function configuredReferenceVideoUrl(
  configs: Record<string, string | undefined>,
  key: CreateReferenceVideoConfigKey
): string | undefined {
  const value = configs[key]?.trim();
  return value || undefined;
}

/** URL Create should send. `fallbackUrl` is the built-in public R2 object. */
export function resolveCreateReferenceVideoUrl({
  configs,
  referenceVideoVersion,
  fallbackUrl,
}: {
  configs: Record<string, string | undefined>;
  referenceVideoVersion: string;
  fallbackUrl: string;
}): string {
  const specific =
    referenceVideoVersion === 'trio12'
      ? configuredReferenceVideoUrl(configs, CREATE_REFERENCE_VIDEO_URL_12S)
      : referenceVideoVersion === 'trio15'
        ? configuredReferenceVideoUrl(configs, CREATE_REFERENCE_VIDEO_URL_15S)
        : undefined;
  if (specific) return specific;
  const shared =
    referenceVideoVersion === 'trio12' ||
    referenceVideoVersion === 'trio15' ||
    referenceVideoVersion === 'from7s15s' ||
    referenceVideoVersion === 'from4s15s'
      ? configuredReferenceVideoUrl(configs, CREATE_REFERENCE_VIDEO_URL)
      : undefined;
  return shared || fallbackUrl;
}

/**
 * Reject a reference URL the upstream provider cannot download.
 * Empty values are allowed and mean "use the built-in clip".
 */
export async function probeReferenceVideoUrl(raw: string): Promise<void> {
  const url = raw.trim();
  if (!url) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Reference video URL must be a valid https URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Reference video URL must use https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Reference video URL must not include credentials');
  }
  if (PRIVATE_HOST.test(parsed.hostname)) {
    throw new Error('Reference video URL must be publicly reachable');
  }
  if (!parsed.pathname.toLowerCase().endsWith('.mp4')) {
    throw new Error('Reference video URL must be an MP4 file');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Range: 'bytes=0-1' },
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error(
      'Reference video URL could not be downloaded. It must be a public https MP4.'
    );
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      'Reference video URL must be a direct download and must not redirect'
    );
  }
  const type = response.headers.get('content-type') ?? '';
  if (/text\/html|application\/json/i.test(type)) {
    throw new Error('Reference video URL did not return a video');
  }
  try {
    await response.body?.cancel();
  } catch {
    // The status check below is the gate. Cancelling the body is best-effort.
  }
  if (response.status !== 206) {
    throw new Error(
      `Reference video URL must answer Range bytes=0-1 with HTTP 206 (got ${response.status}). Use a public R2 object, not a Worker static file.`
    );
  }
}
