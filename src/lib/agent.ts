// Mint a new chat session id in the `s-<ts_ms>-<rand6>` format
// (e.g. `s-1777280106721-q5mzjc`). The same id is used as the chat row id,
// the open-agent-sdk session id, and the per-session workspace directory
// name, so it must stay filesystem- and URL-safe.
export function newAgentSessionId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `s-${ts}-${rand}`;
}

export function isAgentSessionId(value: string): boolean {
  return /^s-\d{10,}-[a-z0-9]{4,}$/.test(value);
}

/** The media type the user sees. The Agent decides its generation role. */
export type AttachmentMediaType = 'image' | 'audio' | 'video';

/**
 * Old drafts may still carry parameter-specific kinds. Keep accepting them
 * when replaying a saved initial turn, but new composer attachments only use
 * image/audio/video.
 */
export type AttachmentKind =
  | AttachmentMediaType
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_audio'
  | 'reference_video';

/** A reference asset attached to a composer, tracked through its upload. */
export interface PendingAttachment {
  id: string;
  name: string;
  /** Omitted on older saved turns, where every attachment was a first frame. */
  kind?: AttachmentKind;
  /** Object URL while uploading, remote URL once uploaded. */
  preview: string;
  url?: string;
  status: 'uploading' | 'uploaded' | 'error';
  error?: string;
}

export function newAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Upload one image and return its public URL. Requires a signed-in session. */
export async function uploadChatImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('files', file);

  const res = await fetch('/api/storage/upload-image', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);

  const json = await res.json();
  if (json.code !== 0 || !json.data?.urls?.[0]) {
    throw new Error(json.message || 'Upload failed');
  }
  return json.data.urls[0] as string;
}

/** Upload public image, audio, or video material in one rate-limited request. */
export async function uploadChatMedia(files: File[]): Promise<string[]> {
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  formData.append('requirePublic', 'true');
  formData.append('referenceMedia', 'true');

  const res = await fetch('/api/storage/upload-image', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);

  const json = await res.json();
  if (json.code !== 0 || !Array.isArray(json.data?.urls)) {
    throw new Error(json.message || 'Upload failed');
  }
  return json.data.urls as string[];
}

/** Whether a bundled/same-origin asset still needs a public storage URL. */
export function isLocalChatMediaUrl(
  src: string,
  origin: string = typeof window === 'undefined' ? '' : window.location.origin
): boolean {
  if (!src || !origin) return false;
  try {
    const url = new URL(src, origin);
    return url.origin === origin || isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value === '0.0.0.0' ||
    value === '::1' ||
    value === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(value)
  );
}

function mediaMimeType(pathname: string, responseType: string): string {
  const normalized = responseType.split(';')[0].trim().toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }
  const extension = pathname.split('.').pop()?.toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      m4v: 'video/x-m4v',
    }[extension ?? ''] || 'application/octet-stream'
  );
}

export interface ChatMediaSource {
  src: string;
  name?: string;
}

/**
 * Copy bundled/same-origin media into configured public storage before it is
 * handed to an external generation provider. CDN URLs already reachable by
 * the provider pass through unchanged.
 */
export async function publishChatMediaSources(
  sources: ChatMediaSource[]
): Promise<string[]> {
  const urls = sources.map((source) => source.src);
  const localSources = sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => isLocalChatMediaUrl(source.src));
  if (localSources.length === 0) return urls;

  const files = await Promise.all(
    localSources.map(async ({ source }) => {
      const sourceUrl = new URL(source.src, window.location.origin);
      // Old local conversations can contain a different dev-server port.
      // The same bundled path is available from the current app origin.
      const assetUrl = isLoopbackHostname(sourceUrl.hostname)
        ? new URL(
            `${sourceUrl.pathname}${sourceUrl.search}`,
            window.location.origin
          )
        : sourceUrl;
      const response = await fetch(assetUrl.href, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`Unable to load example media (${response.status})`);
      }

      const blob = await response.blob();
      const filename =
        source.name ||
        decodeURIComponent(assetUrl.pathname.split('/').pop() || '') ||
        'reference-media';
      return new File([blob], filename, {
        type: mediaMimeType(assetUrl.pathname, blob.type),
      });
    })
  );
  const uploaded = await uploadChatMedia(files);
  if (uploaded.length !== localSources.length || uploaded.some((url) => !url)) {
    throw new Error('Upload failed');
  }

  localSources.forEach(({ index }, uploadIndex) => {
    urls[index] = uploaded[uploadIndex];
  });
  return urls;
}

/** Backwards-compatible single-file helper. */
export async function uploadChatReference(file: File): Promise<string> {
  const urls = await uploadChatMedia([file]);
  if (!urls[0]) throw new Error('Upload failed');
  return urls[0];
}

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
]);
const SUPPORTED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);

/** Validate local files against the same allowlist as the upload endpoint. */
export function mediaTypeForFile(file: File): AttachmentMediaType | null {
  if (SUPPORTED_IMAGE_TYPES.has(file.type)) return 'image';
  if (SUPPORTED_AUDIO_TYPES.has(file.type)) return 'audio';
  if (SUPPORTED_VIDEO_TYPES.has(file.type)) return 'video';
  return null;
}

/** Normalize both new generic kinds and old parameter-specific drafts. */
export function mediaTypeForAttachment(
  attachment: Pick<PendingAttachment, 'kind'>
): AttachmentMediaType {
  if (attachment.kind === 'audio' || attachment.kind === 'reference_audio') {
    return 'audio';
  }
  if (attachment.kind === 'video' || attachment.kind === 'reference_video') {
    return 'video';
  }
  return 'image';
}

/**
 * Image files carried by a paste event. Screenshots arrive as a single
 * `image/*` item with no name, so we synthesize one.
 */
export function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files).filter((file) =>
    file.type.startsWith('image/')
  );
  if (files.length > 0) return files;

  return Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
}
