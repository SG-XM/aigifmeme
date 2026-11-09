/** Client-safe GIF pack choices. The image model is not a choice. */

export const GIF_PACK_IMAGE_MODEL = 'gpt-image-2';
export const GIF_PACK_IMAGE_SIZE = '1024x1024';
export const GIF_PACK_IMAGE_QUALITY = 'low';
export const GIF_PACK_TIME_ZONE = 'Asia/Shanghai';
export const GIF_PACK_DAILY_LIMIT = 1;
export const GIF_PACK_USER_REGENS = 2;
export const GIF_PACK_SYSTEM_ATTEMPTS = 3;
export const GIF_PACK_STICKER_COUNT = 8;
export const GIF_PACK_FRAME_COUNT = 16;
export const GIF_PACK_OUTPUT_SIZE = 240;

export const GIF_PACK_STYLES = [
  'original',
  'q-cartoon',
  'anime',
  'cute-3d',
  'doodle',
  'pixel',
  'clay',
  'felt',
] as const;
export type GifPackStyle = (typeof GIF_PACK_STYLES)[number];
export const GIF_PACK_DEFAULT_STYLE: GifPackStyle = 'q-cartoon';

export const GIF_PACK_MOTIONS = ['medium', 'large', 'fast'] as const;
export type GifPackMotion = (typeof GIF_PACK_MOTIONS)[number];
export const GIF_PACK_DEFAULT_MOTION: GifPackMotion = 'medium';

export const GIF_PACK_BACKGROUNDS = ['transparent', 'theme'] as const;
export type GifPackBackground = (typeof GIF_PACK_BACKGROUNDS)[number];
export const GIF_PACK_DEFAULT_BACKGROUND: GifPackBackground = 'transparent';

export const GIF_PACK_LANGUAGES = ['zh', 'en'] as const;
export type GifPackLanguage = (typeof GIF_PACK_LANGUAGES)[number];

export function isGifPackStyle(value: string): value is GifPackStyle {
  return (GIF_PACK_STYLES as readonly string[]).includes(value);
}
export function isGifPackMotion(value: string): value is GifPackMotion {
  return (GIF_PACK_MOTIONS as readonly string[]).includes(value);
}
export function isGifPackBackground(value: string): value is GifPackBackground {
  return (GIF_PACK_BACKGROUNDS as readonly string[]).includes(value);
}
export function isGifPackLanguage(value: string): value is GifPackLanguage {
  return (GIF_PACK_LANGUAGES as readonly string[]).includes(value);
}

/** Shanghai calendar day. The zone is explicit so the quota does not follow the server locale. */
export function gifPackDayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GIF_PACK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function gifPackLanguageForLocale(locale: string): GifPackLanguage {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
