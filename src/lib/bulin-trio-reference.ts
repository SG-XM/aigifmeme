/**
 * Generation inputs only. Kie downloads these with HTTP Range, which the
 * Workers static-asset path does not answer, so they stay on the public R2
 * host (`media.uptownfunkai.video`). Playback demos use `TRIO_DEMO` under
 * `/videos/showcase/home/`. Admin `create_reference_video_url_12s` /
 * `_15s` can replace the MP4 without a deploy.
 */
import { publicReferenceUrl } from '@/lib/public-reference-media';

export const TRIO_MEDIA_VERSIONS = ['trio12', 'trio15'] as const;
export type TrioMediaVersion = (typeof TRIO_MEDIA_VERSIONS)[number];

export interface TrioMediaSource {
  url: string;
  durationSeconds: number;
}

export const TRIO_REFERENCE_VIDEOS: Record<TrioMediaVersion, TrioMediaSource> =
  {
    trio12: {
      url: publicReferenceUrl('bulin-trio-12s-v1.mp4'),
      durationSeconds: 12,
    },
    trio15: {
      url: publicReferenceUrl('bulin-trio-15s-v1.mp4'),
      durationSeconds: 15,
    },
  };

export const TRIO_SOUNDTRACKS: Record<TrioMediaVersion, TrioMediaSource> = {
  trio12: {
    url: publicReferenceUrl('bulin-trio-12s-v1.m4a'),
    durationSeconds: 12,
  },
  trio15: {
    url: publicReferenceUrl('bulin-trio-15s-v1.m4a'),
    durationSeconds: 15,
  },
};

/** AI-generated trio result shown in the create form when Trio is selected. */
export const TRIO_DEMO = {
  src: '/videos/showcase/home/bulin-trio-effect-v1.mp4',
  poster: '/videos/showcase/home/bulin-trio-effect-v1.jpg',
} as const;

export function isTrioMediaVersion(value: unknown): value is TrioMediaVersion {
  return value === 'trio12' || value === 'trio15';
}

export function trioVersionForDuration(
  durationSeconds: number
): TrioMediaVersion {
  return durationSeconds === 15 ? 'trio15' : 'trio12';
}
