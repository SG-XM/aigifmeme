import { isPublicHttpsUrl } from '@/lib/im-so-sorry';

export { DAME_HOMBRO_ALIAS_PATH, DAME_HOMBRO_PATH } from './dame-hombro-path';

export const DAME_HOMBRO_TEMPLATE_SLUG = 'dame-hombro';
export const FREERAP_API_ORIGIN = 'https://freerapvideo.com';
export const DAME_HOMBRO_POLL_MS = 30_000;

export const DAME_HOMBRO_MODELS = ['basic', 'pro', 'ultra'] as const;
export const DAME_HOMBRO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export const DAME_HOMBRO_DURATIONS = [12, 15] as const;
export const DAME_HOMBRO_ASPECTS = ['9:16', '16:9', 'adaptive'] as const;
export const DAME_HOMBRO_EFFECTS = ['solo', 'trio'] as const;
export const DAME_HOMBRO_STATUSES = [
  'pending',
  'processing',
  'success',
  'failed',
  'canceled',
] as const;

export type DameHombroModel = (typeof DAME_HOMBRO_MODELS)[number];
export type DameHombroResolution = (typeof DAME_HOMBRO_RESOLUTIONS)[number];
export type DameHombroDuration = (typeof DAME_HOMBRO_DURATIONS)[number];
export type DameHombroAspect = (typeof DAME_HOMBRO_ASPECTS)[number];
export type DameHombroEffect = (typeof DAME_HOMBRO_EFFECTS)[number];
export type DameHombroStatus = (typeof DAME_HOMBRO_STATUSES)[number];

export const DAME_HOMBRO_DEFAULTS = {
  model: 'pro',
  resolution: '720p',
  duration: 12,
  aspectRatio: '9:16',
  effect: 'trio',
} as const satisfies {
  model: DameHombroModel;
  resolution: DameHombroResolution;
  duration: DameHombroDuration;
  aspectRatio: DameHombroAspect;
  effect: DameHombroEffect;
};

/**
 * FreeRap credits for this template. UX copy only — not an Uptown charge.
 * basic and pro have no 1080p cell. An unpriced pair is omitted here;
 * FreeRap answers 403 if one is submitted anyway.
 */
export const DAME_HOMBRO_PRICED_CELLS = [
  { model: 'basic', resolution: '480p', credits: 90 },
  { model: 'basic', resolution: '720p', credits: 180 },
  { model: 'pro', resolution: '480p', credits: 250 },
  { model: 'pro', resolution: '720p', credits: 540 },
  { model: 'ultra', resolution: '480p', credits: 620 },
  { model: 'ultra', resolution: '720p', credits: 1370 },
  { model: 'ultra', resolution: '1080p', credits: 3420 },
] as const satisfies ReadonlyArray<{
  model: DameHombroModel;
  resolution: DameHombroResolution;
  credits: number;
}>;

const TASK_ID = /^[A-Za-z0-9_-]{8,80}$/;

export class DameHombroRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DameHombroRequestError';
  }
}

export type DameHombroCreateInput = {
  centerUrl?: string;
  leftUrl?: string;
  rightUrl?: string;
  model?: string;
  resolution?: string;
  duration?: number;
  aspectRatio?: string;
  effect?: string;
};

export type DameHombroSlots = {
  center: string;
  left?: string;
  right?: string;
};

/** Body sent to FreeRap. Prompt and reference video fields are never included. */
export type DameHombroCreateBody = {
  reference_image_urls: [string];
  effect: DameHombroEffect;
  slots?: DameHombroSlots;
  model: DameHombroModel;
  resolution: DameHombroResolution;
  duration: DameHombroDuration;
  aspect_ratio: DameHombroAspect;
};

export type DameHombroTaskView = {
  taskId: string;
  status: DameHombroStatus;
  videos: string[];
  freerapCreditsEstimate: number | null;
  freerapCreditsCharged: number | null;
};

export function dameHombroCredits(
  model: string,
  resolution: string
): number | null {
  const cell = DAME_HOMBRO_PRICED_CELLS.find(
    (item) => item.model === model && item.resolution === resolution
  );
  return cell ? cell.credits : null;
}

export function dameHombroCreateUrl(): string {
  return `${FREERAP_API_ORIGIN}/api/v1/templates/${DAME_HOMBRO_TEMPLATE_SLUG}/generations`;
}

export function dameHombroPollUrl(taskId: string): string {
  if (!isDameHombroTaskId(taskId)) {
    throw new DameHombroRequestError('Unknown task');
  }
  return `${FREERAP_API_ORIGIN}/api/v1/generations/${encodeURIComponent(taskId)}`;
}

export function isDameHombroTaskId(value: string): boolean {
  return TASK_ID.test(value);
}

export function isDameHombroImageUrl(value: string): boolean {
  if (!isPublicHttpsUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.port === '' || url.port === '443';
  } catch {
    return false;
  }
}

export function isSamePublicOrigin(url: string, sampleUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(sampleUrl).origin;
  } catch {
    return false;
  }
}

export function readDameHombroCreateInput(
  payload: unknown
): DameHombroCreateInput {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DameHombroRequestError('Invalid request');
  }
  const record = payload as Record<string, unknown>;
  return {
    centerUrl: optionalString(record.centerUrl),
    leftUrl: optionalString(record.leftUrl),
    rightUrl: optionalString(record.rightUrl),
    model: optionalString(record.model),
    resolution: optionalString(record.resolution),
    duration: optionalDuration(record.duration),
    aspectRatio: optionalString(record.aspectRatio),
    effect: optionalString(record.effect),
  };
}

export function buildDameHombroCreateBody(
  input: DameHombroCreateInput
): DameHombroCreateBody {
  const center = input.centerUrl?.trim() ?? '';
  if (!center) throw new DameHombroRequestError('Add a center face photo.');
  if (!isDameHombroImageUrl(center)) {
    throw new DameHombroRequestError(
      'Center photo must be a public HTTPS URL.'
    );
  }
  const effect = pickEnum(
    input.effect,
    DAME_HOMBRO_EFFECTS,
    DAME_HOMBRO_DEFAULTS.effect,
    'Unknown effect.'
  );
  const model = pickEnum(
    input.model,
    DAME_HOMBRO_MODELS,
    DAME_HOMBRO_DEFAULTS.model,
    'Unknown model.'
  );
  const resolution = pickEnum(
    input.resolution,
    DAME_HOMBRO_RESOLUTIONS,
    DAME_HOMBRO_DEFAULTS.resolution,
    'Unknown resolution.'
  );
  const duration = pickDuration(input.duration);
  const aspect = pickEnum(
    input.aspectRatio,
    DAME_HOMBRO_ASPECTS,
    DAME_HOMBRO_DEFAULTS.aspectRatio,
    'Unknown aspect ratio.'
  );
  const shared = {
    reference_image_urls: [center] as [string],
    effect,
    model,
    resolution,
    duration,
    aspect_ratio: aspect,
  };
  if (effect === 'solo') return shared;
  const left = optionalImage(blankToUndefined(input.leftUrl), 'Left photo');
  const right = optionalImage(blankToUndefined(input.rightUrl), 'Right photo');
  const slots: DameHombroSlots = {
    ...(left ? { left } : {}),
    center,
    ...(right ? { right } : {}),
  };
  return {
    reference_image_urls: shared.reference_image_urls,
    effect: shared.effect,
    slots,
    model: shared.model,
    resolution: shared.resolution,
    duration: shared.duration,
    aspect_ratio: shared.aspect_ratio,
  };
}

export function assertDameHombroHosted(
  body: DameHombroCreateBody,
  storageSampleUrl: string
): void {
  const urls = [
    body.reference_image_urls[0],
    body.slots?.center,
    body.slots?.left,
    body.slots?.right,
  ].filter((url): url is string => Boolean(url));
  for (const url of urls) {
    if (!isSamePublicOrigin(url, storageSampleUrl)) {
      throw new DameHombroRequestError(
        'Photos must be uploaded to this site public storage.'
      );
    }
  }
}

export function parseFreerapTask(
  payload: unknown
): { ok: true; task: DameHombroTaskView } | { ok: false; message: string } {
  const envelope = readEnvelope(payload);
  if (!envelope.ok) return { ok: false, message: envelope.message };
  const data = envelope.data;
  const taskId = typeof data.taskId === 'string' ? data.taskId : '';
  const status = data.status;
  if (!taskId || !isDameHombroStatus(status)) {
    return { ok: false, message: 'Unexpected response' };
  }
  return {
    ok: true,
    task: {
      taskId,
      status,
      videos: readVideos(data.videos),
      freerapCreditsEstimate: finiteNumber(data.credits_estimate),
      freerapCreditsCharged:
        finiteNumber(data.credits_charged) ?? finiteNumber(data.costCredits),
    },
  };
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalImage(
  value: string | undefined,
  label: string
): string | undefined {
  if (!value) return undefined;
  if (!isDameHombroImageUrl(value)) {
    throw new DameHombroRequestError(`${label} must be a public HTTPS URL.`);
  }
  return value;
}

function pickDuration(value: number | undefined): DameHombroDuration {
  if (value == null) return DAME_HOMBRO_DEFAULTS.duration;
  if ((DAME_HOMBRO_DURATIONS as readonly number[]).includes(value)) {
    return value as DameHombroDuration;
  }
  throw new DameHombroRequestError('Unknown duration.');
}

function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  error: string
): T {
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new DameHombroRequestError(error);
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    throw new DameHombroRequestError('Invalid request');
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalDuration(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  throw new DameHombroRequestError('Unknown duration.');
}

function isDameHombroStatus(value: unknown): value is DameHombroStatus {
  return (
    typeof value === 'string' &&
    (DAME_HOMBRO_STATUSES as readonly string[]).includes(value)
  );
}

function readEnvelope(
  payload: unknown
):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Unexpected response' };
  }
  const record = payload as Record<string, unknown>;
  const code = record.code;
  const message =
    typeof record.message === 'string' && record.message.trim()
      ? record.message.trim()
      : 'Unexpected response';
  if (code !== 0) return { ok: false, message };
  const data = record.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: 'Unexpected response' };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

function readVideos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    const url = videoUrl(item);
    if (url) urls.push(url);
  }
  return urls;
}

function videoUrl(item: unknown): string | null {
  if (typeof item === 'string') {
    return isPublicHttpsUrl(item) ? item : null;
  }
  if (item && typeof item === 'object' && 'url' in item) {
    const url = (item as { url?: unknown }).url;
    if (typeof url === 'string' && isPublicHttpsUrl(url)) return url;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
