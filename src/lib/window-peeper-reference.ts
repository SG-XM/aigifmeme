export const WINDOW_PEEPER_MEDIA_VERSION = 'windowPeeper' as const;
export type WindowPeeperMediaVersion = typeof WINDOW_PEEPER_MEDIA_VERSION;

export const WINDOW_PEEPER_UPDATED_AT = '2026-10-24';

/**
 * Motion reference Seedance fetches for the Window Peeper recast.
 *
 * Same night-window H.264 clip as the Artemis showcase demo (ffprobe 14.116s,
 * 1080×1920): night street, push-in to one lit window, the look back, and the
 * curtain. Seedance 2.5 still prices a 15-second output.
 *
 * The generation URL is on the public R2 host under `reference/`, the same
 * pattern as the freestyle and trio refs. Those objects answer HTTP Range
 * (206). The Worker path `/videos/showcase/window-peeper/…` does not, and Kie
 * then fails the download (`content[0].image_url` resource download failed).
 * Marketing players use `WINDOW_PEEPER_RESULT`, not this reference file.
 *
 * Bucket object key: `reference/window-peeper-master.mp4` (`bulin47ai`).
 */
export const WINDOW_PEEPER_REFERENCE = {
  url: 'https://media.uptownfunkai.video/reference/window-peeper-master.mp4',
  durationSeconds: 14,
};

/**
 * Bed muxed onto silent Seedance output, same path as Burning Bridges.
 *
 * AAC LC, 44.1 kHz stereo, 14.116s, copied (`ffmpeg -c:a copy`) from the
 * audio track of `reference/window-peeper-master.mp4`. That object is the
 * same night-window clip as the Artemis showcase file
 * `public/videos/showcase/window-peeper/7699137962344189206.mp4`.
 * Workers load this site path through the asset binding.
 * `mergeVideoAudio` trims it to the generated clip (12s uses the first 12s;
 * a 15s clip keeps the full 14.116s bed and a short silent tail).
 */
export const WINDOW_PEEPER_SOUNDTRACK = {
  url: '/audio/window-peeper-reference.m4a',
  durationSeconds: 14.116,
};

/**
 * Canonical Window Peeper result.
 *
 * The case compare, the peeper retention offer, and the first hero and
 * examples card read this object. The file is the 15s generation published at
 * `uploads/agent/sessions/create/594696a4-0ac0-4033-b410-dc73d80f227d/vid_594696a4-0ac0-4033-b410-dc73d80f227d_0.mp4`,
 * copied under the site showcase prefix so playback does not depend on that
 * session key. The poster is the look-back frame. The clip includes the
 * Window Peeper soundtrack.
 */
export const WINDOW_PEEPER_RESULT = {
  src: '/videos/showcase/window-peeper/result-v1.mp4',
  poster: '/videos/showcase/window-peeper/result-v1.jpg',
} as const;

/**
 * Before/after on the landing, and the original still in peeper retention.
 * The input is the wolf portrait with the black field removed. Result and
 * poster are `WINDOW_PEEPER_RESULT`.
 */
export const WINDOW_PEEPER_CASE = {
  id: 'wolf',
  input: '/videos/showcase/window-peeper/wolf-case-input.png',
  src: WINDOW_PEEPER_RESULT.src,
  poster: WINDOW_PEEPER_RESULT.poster,
} as const;

/** Public trend clip linked from the origin note. Showcase cards do not link out. */
export const WINDOW_PEEPER_TREND_SOURCE =
  'https://www.tiktok.com/@artemiscc_capcut/video/7699137962344189206';

/**
 * Hero and examples-row playback.
 *
 * The first card is the shared site result (`WINDOW_PEEPER_RESULT`). The case
 * compare and the peeper retention offer keep reading that object directly.
 * The other three cards are the public trend clips. Cards do not link out or
 * name creators.
 */
export const WINDOW_PEEPER_DEMOS = [
  {
    id: 'example',
    src: WINDOW_PEEPER_RESULT.src,
    poster: WINDOW_PEEPER_RESULT.poster,
  },
  {
    id: 'artemis',
    src: '/videos/showcase/window-peeper/7699137962344189206.mp4',
  },
  {
    id: 'rodent',
    src: '/videos/showcase/window-peeper/7698685812455591190.mp4',
  },
  {
    id: 'viral',
    src: '/videos/showcase/window-peeper/7699214262907997462.mp4',
  },
] as const;

export function isWindowPeeperMediaVersion(
  value: unknown
): value is WindowPeeperMediaVersion {
  return value === WINDOW_PEEPER_MEDIA_VERSION;
}

export function requireWindowPeeperReference() {
  return WINDOW_PEEPER_REFERENCE;
}
