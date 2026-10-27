import { publicReferenceUrl } from '@/lib/public-reference-media';

export const BULIN_MEDIA_VERSIONS = ['from7s15s', 'from4s15s'] as const;
export type BulinMediaVersion = (typeof BULIN_MEDIA_VERSIONS)[number];
export const BULIN_FIXED_MEDIA_VERSION = 'from7s15s' as const;

export interface BulinMediaSource {
  url: string;
  durationSeconds: number;
}

export const BULIN_ORIGINAL_VIDEO: BulinMediaSource = {
  url: publicReferenceUrl('bulin47-freestyle-full-46s-v1.mp4'),
  durationSeconds: 46.333333,
};

export const BULIN_REFERENCE_VIDEOS: Record<
  BulinMediaVersion,
  BulinMediaSource
> = {
  from7s15s: {
    url: publicReferenceUrl('bulin47-freestyle-from-7s-15s.mp4'),
    durationSeconds: 15,
  },
  from4s15s: {
    url: publicReferenceUrl('bulin47-freestyle-from-4s-15s.mp4'),
    durationSeconds: 15,
  },
};

export const BULIN_SOUNDTRACKS: Record<BulinMediaVersion, BulinMediaSource> = {
  from7s15s: {
    url: '/audio/bulin-reference-from-7s-15s-v1.m4a',
    durationSeconds: 15,
  },
  from4s15s: {
    url: '/audio/bulin-reference-from-4s-15s-v1.m4a',
    durationSeconds: 15,
  },
};

/**
 * AI-generated solo result shown in the create form when Solo dance is
 * selected, and the first homepage hero card. The form paints the poster
 * and loads the clip only after the visitor plays it.
 */
export const SOLO_DEMO = {
  src: '/videos/showcase/home/werewolf-dance-home-v1.mp4',
  poster: '/videos/showcase/home/werewolf-dance-poster.jpg',
} as const;

/**
 * Werewolf clip in the post-purchase retention dialog and the duo upgrade
 * offer. The poster matches `SOLO_DEMO` (same bytes as the old R2 poster).
 */
export const WEREWOLF_OFFER_MEDIA = {
  src: '/videos/showcase/home/werewolf-dance-popup-v1.mp4',
  poster: '/videos/showcase/home/werewolf-dance-poster.jpg',
  image: '/videos/showcase/home/werewolf-v1.webp',
} as const;

/** Preserve the soundtrack accepted by jobs created before version selection. */
export const LEGACY_BULIN_SOUNDTRACK_PATH = '/audio/bulin-reference-audio.m4a';

export function isBulinMediaVersion(
  value: unknown
): value is BulinMediaVersion {
  return value === 'from7s15s' || value === 'from4s15s';
}

export function supportsBulinReferenceVideo(
  modelName: string,
  version: BulinMediaVersion
) {
  const source = BULIN_REFERENCE_VIDEOS[version];
  const maxDuration = modelName === 'seedance-2-5' ? 30 : 15;
  return source.durationSeconds <= maxDuration;
}
