export const BURNING_BRIDGES_MEDIA_VERSION = 'bridgesParty15s' as const;
export type BurningBridgesMediaVersion = typeof BURNING_BRIDGES_MEDIA_VERSION;

/**
 * Retired campaign. The old site path
 * `/videos/reference/burning-bridges-party-2m37s-15s.mp4` is 404, and that
 * object is not on the public R2 host either. Create refuses the campaign
 * instead of sending `video_url`. Duration stays for pricing of stored jobs.
 */
export const BURNING_BRIDGES_REFERENCE = {
  durationSeconds: 15,
};

/** Landing examples. Files live under `public/videos/showcase/burning-bridges/`. */
export const BURNING_BRIDGES_SHOWCASE = [
  '/videos/showcase/burning-bridges/bridges-solo.mp4',
  '/videos/showcase/burning-bridges/bridges-man.mp4',
  '/videos/showcase/burning-bridges/bridges-wide.mp4',
] as const;

export const BURNING_BRIDGES_SOUNDTRACK = {
  url: '/audio/burning-bridges-party-2m37s-15s.m4a',
  durationSeconds: 15,
};

export function isBurningBridgesMediaVersion(
  value: unknown
): value is BurningBridgesMediaVersion {
  return value === BURNING_BRIDGES_MEDIA_VERSION;
}
