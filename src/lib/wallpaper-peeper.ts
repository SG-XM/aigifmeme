/**
 * Window Peeper dogfood page. Public path is `/wallpaper-peeper`.
 * `/window-peeper` stays retired (HTTP 410).
 *
 * Create and poll go through the shared FreeRap client
 * (`src/lib/freerap-client.ts` + `src/lib/freerap-api-key.ts`).
 *
 * Integrate Copy v2: slug window-peeper, one image slot, duration 12,
 * aspect 9:16, model pro, resolution 720p.
 */

import { FREERAP_API_ORIGIN, isSamePublicOrigin } from '@/lib/dame-hombro';
import { isPublicHttpsUrl } from '@/lib/im-so-sorry';

export const WALLPAPER_PEEPER_PATH = '/wallpaper-peeper';
export const WALLPAPER_PEEPER_POLL_MS = 30_000;
export const WINDOW_PEEPER_TEMPLATE_SLUG = 'window-peeper';

export const WINDOW_PEEPER_MODELS = ['basic', 'pro', 'ultra'] as const;
export const WINDOW_PEEPER_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export const WINDOW_PEEPER_DURATIONS = [12, 15] as const;
export const WINDOW_PEEPER_ASPECTS = ['9:16', '16:9', 'adaptive'] as const;
export const WINDOW_PEEPER_STATUSES = [
  'pending',
  'processing',
  'success',
  'failed',
  'canceled',
] as const;

export type WindowPeeperModel = (typeof WINDOW_PEEPER_MODELS)[number];
export type WindowPeeperResolution = (typeof WINDOW_PEEPER_RESOLUTIONS)[number];
export type WindowPeeperDuration = (typeof WINDOW_PEEPER_DURATIONS)[number];
export type WindowPeeperAspect = (typeof WINDOW_PEEPER_ASPECTS)[number];
export type WindowPeeperStatus = (typeof WINDOW_PEEPER_STATUSES)[number];

export const WINDOW_PEEPER_TEMPLATE = {
  slug: WINDOW_PEEPER_TEMPLATE_SLUG,
  label: 'Window Peeper',
  imageSlots: 1,
  defaultDuration: 12,
  defaultAspectRatio: '9:16',
  defaultModel: 'pro',
  defaultResolution: '720p',
} as const satisfies {
  slug: string;
  label: string;
  imageSlots: number;
  defaultDuration: WindowPeeperDuration;
  defaultAspectRatio: WindowPeeperAspect;
  defaultModel: WindowPeeperModel;
  defaultResolution: WindowPeeperResolution;
};

/** FreeRap account credits for this template. UX copy only — not an Uptown charge. */
export const WINDOW_PEEPER_PRICED_CELLS = [
  { model: 'basic', resolution: '480p', credits: 100 },
  { model: 'basic', resolution: '720p', credits: 200 },
  { model: 'pro', resolution: '480p', credits: 270 },
  { model: 'pro', resolution: '720p', credits: 590 },
  { model: 'ultra', resolution: '480p', credits: 670 },
  { model: 'ultra', resolution: '720p', credits: 1490 },
  { model: 'ultra', resolution: '1080p', credits: 3730 },
] as const satisfies ReadonlyArray<{
  model: WindowPeeperModel;
  resolution: WindowPeeperResolution;
  credits: number;
}>;

const TASK_ID = /^[A-Za-z0-9_-]{8,80}$/;
const SERVER_OWNED = [
  'prompt',
  'reference_video_urls',
  'referenceVideoUrls',
  'callBackUrl',
  'callbackUrl',
] as const;

/** Same shape `proxyFreerap` returns for every template. */
export type WallpaperPeeperTaskView = {
  taskId: string;
  status: WindowPeeperStatus;
  videos: string[];
  freerapCreditsEstimate: number | null;
  freerapCreditsCharged: number | null;
};

export type WallpaperPeeperCreateBody = {
  reference_image_urls: [string];
  model: WindowPeeperModel;
  resolution: WindowPeeperResolution;
  duration: WindowPeeperDuration;
  aspect_ratio: WindowPeeperAspect;
  effect: 'solo';
};

export class WallpaperPeeperRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WallpaperPeeperRequestError';
    this.status = status;
  }
}

export function windowPeeperCredits(
  model: string,
  resolution: string
): number | null {
  const cell = WINDOW_PEEPER_PRICED_CELLS.find(
    (item) => item.model === model && item.resolution === resolution
  );
  return cell ? cell.credits : null;
}

export function windowPeeperResolutions(
  model: WindowPeeperModel
): WindowPeeperResolution[] {
  return WINDOW_PEEPER_PRICED_CELLS.filter((item) => item.model === model).map(
    (item) => item.resolution
  );
}

export function windowPeeperResolutionFor(
  model: WindowPeeperModel,
  resolution: WindowPeeperResolution
): WindowPeeperResolution {
  return windowPeeperCredits(model, resolution) == null ? '720p' : resolution;
}

export function isWallpaperPeeperTaskId(value: string): boolean {
  return TASK_ID.test(value);
}

export function wallpaperPeeperCreateUrl(): string {
  return `${FREERAP_API_ORIGIN}/api/v1/templates/${WINDOW_PEEPER_TEMPLATE_SLUG}/generations`;
}

export function wallpaperPeeperPollUrl(taskId: string): string {
  if (!isWallpaperPeeperTaskId(taskId)) {
    throw new WallpaperPeeperRequestError('Unknown task', 404);
  }
  return `${FREERAP_API_ORIGIN}/api/v1/generations/${encodeURIComponent(taskId)}`;
}

export function buildWallpaperPeeperCreateBody(
  payload: unknown
): WallpaperPeeperCreateBody {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new WallpaperPeeperRequestError('Invalid JSON');
  }
  const record = payload as Record<string, unknown>;
  for (const key of SERVER_OWNED) {
    if (key in record) {
      throw new WallpaperPeeperRequestError(
        'This template does not accept a prompt or reference video'
      );
    }
  }
  if (record.effect === 'trio' || record.slots != null) {
    throw new WallpaperPeeperRequestError('This template takes one photo.');
  }

  const reference =
    typeof record.referenceImageUrl === 'string'
      ? record.referenceImageUrl.trim()
      : '';
  if (!reference)
    throw new WallpaperPeeperRequestError('Upload one photo first');
  if (!isWallpaperImageUrl(reference)) {
    throw new WallpaperPeeperRequestError(
      'Upload the photo on this site before generating'
    );
  }

  const model = pickEnum(
    record.model,
    WINDOW_PEEPER_MODELS,
    WINDOW_PEEPER_TEMPLATE.defaultModel,
    'Invalid model'
  );
  const resolution = pickEnum(
    record.resolution,
    WINDOW_PEEPER_RESOLUTIONS,
    WINDOW_PEEPER_TEMPLATE.defaultResolution,
    'Invalid resolution'
  );
  const duration = pickDuration(record.duration);
  const aspect = pickAspect(record.aspectRatio);
  if (windowPeeperCredits(model, resolution) == null) {
    throw new WallpaperPeeperRequestError('template not priced', 403);
  }

  return {
    reference_image_urls: [reference],
    model,
    resolution,
    duration,
    aspect_ratio: aspect,
    effect: 'solo',
  };
}

export function assertWallpaperPeeperHosted(
  body: WallpaperPeeperCreateBody,
  storageSampleUrl: string
): void {
  if (!isSamePublicOrigin(body.reference_image_urls[0], storageSampleUrl)) {
    throw new WallpaperPeeperRequestError(
      'Upload the photo on this site before generating'
    );
  }
}

function isWallpaperImageUrl(value: string): boolean {
  if (!isPublicHttpsUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.port === '' || url.port === '443';
  } catch {
    return false;
  }
}

function pickDuration(value: unknown): WindowPeeperDuration {
  if (value == null || value === '')
    return WINDOW_PEEPER_TEMPLATE.defaultDuration;
  if (
    typeof value === 'number' &&
    (WINDOW_PEEPER_DURATIONS as readonly number[]).includes(value)
  ) {
    return value as WindowPeeperDuration;
  }
  throw new WallpaperPeeperRequestError('Invalid duration');
}

function pickAspect(value: unknown): WindowPeeperAspect {
  if (value == null || value === '')
    return WINDOW_PEEPER_TEMPLATE.defaultAspectRatio;
  if (value === 'auto') return 'adaptive';
  if (
    typeof value === 'string' &&
    (WINDOW_PEEPER_ASPECTS as readonly string[]).includes(value)
  ) {
    return value as WindowPeeperAspect;
  }
  throw new WallpaperPeeperRequestError('Invalid aspect ratio');
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  error: string
): T {
  if (value == null || value === '') return fallback;
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  throw new WallpaperPeeperRequestError(error);
}
