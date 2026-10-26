import { LIVE_EFFECTS, type LiveEffectId } from '@/lib/ai-video-paths';
import { SOLO_DEMO } from '@/lib/bulin-reference';
import { WINDOW_PEEPER_RESULT } from '@/lib/window-peeper-reference';

/** Header Trending shows this many scenes, newest first. */
export const TRENDING_EFFECT_LIMIT = 4;

/**
 * Effects the first-visit announcement treats as new.
 * I'm So Sorry and Window Peeper. Burning Bridges and Bulin stay unmarked.
 */
const FRESH_EFFECTS = new Set<LiveEffectId>(['sorry', 'peeper']);

export interface TrendingEffectMedia {
  kind: 'video' | 'image';
  src: string;
  poster?: string;
}

export interface TrendingEffect {
  id: LiveEffectId;
  /** Generator on that effect's live scene page. */
  href: string;
  fresh: boolean;
  media?: TrendingEffectMedia;
}

/**
 * Demo media already shipped for marketing players.
 * I'm So Sorry uses the first carousel frame (the dream look).
 */
const MEDIA: Partial<Record<LiveEffectId, TrendingEffectMedia>> = {
  sorry: {
    kind: 'image',
    // First carousel frame. Inlined so the homepage header does not import
    // `im-so-sorry-demos` (that shared chunk was modulepreloaded on `/`).
    src: '/images/im-so-sorry/01-dream.jpg',
  },
  peeper: {
    kind: 'video',
    src: WINDOW_PEEPER_RESULT.src,
    poster: WINDOW_PEEPER_RESULT.poster,
  },
  // Portrait still already shown on the first-visit card (720×1280, ~56KB).
  // The party reference is a 1280×720, 2.5MB file with no poster, so this
  // card stayed on the empty peach well until that clip buffered.
  bridges: {
    kind: 'image',
    src: '/videos/showcase/burning-bridges/announce-man.jpg',
  },
  bulin: {
    kind: 'video',
    src: SOLO_DEMO.src,
    poster: SOLO_DEMO.poster,
  },
};

/**
 * The newest live effects.
 * `LIVE_EFFECTS` is oldest → newest. Reverse it and keep four so a later
 * scene replaces the oldest card instead of linking to a retired route.
 */
export function trendingEffects(): TrendingEffect[] {
  return [...LIVE_EFFECTS]
    .reverse()
    .slice(0, TRENDING_EFFECT_LIMIT)
    .map((effect) => ({
      id: effect.id,
      href: effect.createHref,
      fresh: FRESH_EFFECTS.has(effect.id),
      media: MEDIA[effect.id],
    }));
}
