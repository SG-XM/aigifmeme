import { creditsForGeneration } from '@/lib/agent-settings';
import {
  effectHash,
  IM_SO_SORRY_PATH,
  WINDOW_PEEPER_PATH,
} from '@/lib/ai-video-paths';
import { BURNING_BRIDGES_REFERENCE } from '@/lib/burning-bridges-reference';

/**
 * First-visit announcement (localStorage, once per browser).
 * Dismissing by any route — a card, a trend pill, “Keep making this one”,
 * Escape, the backdrop, or the close button — sets the flag.
 * The key stays on v1 so a browser that already dismissed this dialog
 * does not see it again.
 */
export const EFFECTS_ANNOUNCE_STORAGE_KEY = 'bulin-effects-announce-v1';

/**
 * Window Peeper preview for the announcement card.
 * Compressed same-origin copy of the launch result
 * (`uploads/agent/sessions/create/594696a4-…/vid_594696a4-…_0.mp4`, ~3.5MB).
 * The card paints the poster first and loads this file only after a tap.
 */
export const EFFECTS_ANNOUNCE_PEEPER_VIDEO =
  '/videos/showcase/window-peeper/announce-preview.mp4';

/**
 * Burning Bridges preview for the announcement card.
 * Compressed same-origin preview of the Burning Bridges landing example
 * (`/videos/showcase/burning-bridges/bridges-man.mp4`, 4,539,205 bytes).
 */
export const EFFECTS_ANNOUNCE_BRIDGES_VIDEO =
  '/videos/showcase/burning-bridges/announce-preview.mp4';

/** Cheapest selectable Seedance price: mini at 480p for this length. */
function creditFloor(durationSeconds: number): number {
  return creditsForGeneration('seedance-2-mini', durationSeconds, '480p');
}

export type EffectsAnnounceCardId = 'peeper' | 'bridges';

export interface EffectsAnnounceCard {
  id: EffectsAnnounceCardId;
  href: string;
  src: string;
  poster: string;
  /** Only the effect this dialog is announcing. */
  isNew: boolean;
  credits: number;
}

/**
 * Peeper can be 12 or 15 seconds, so the floor is the 12-second price.
 * Burning Bridges is locked to the 15-second source clip.
 */
export const EFFECTS_ANNOUNCE_CARDS: readonly EffectsAnnounceCard[] = [
  {
    id: 'peeper',
    href: effectHash('peeper', 'create'),
    src: EFFECTS_ANNOUNCE_PEEPER_VIDEO,
    poster: '/videos/showcase/window-peeper/announce-result.jpg',
    isNew: true,
    credits: creditFloor(12),
  },
  {
    id: 'bridges',
    href: effectHash('bridges', 'create'),
    src: EFFECTS_ANNOUNCE_BRIDGES_VIDEO,
    poster: '/videos/showcase/burning-bridges/announce-man.jpg',
    isNew: false,
    credits: creditFloor(BURNING_BRIDGES_REFERENCE.durationSeconds),
  },
];

export type EffectsAnnounceMoreId = 'bulin' | 'sorry';

export const EFFECTS_ANNOUNCE_MORE: readonly {
  id: EffectsAnnounceMoreId;
  href: string;
}[] = [
  { id: 'bulin', href: effectHash('bulin', 'create') },
  { id: 'sorry', href: `${IM_SO_SORRY_PATH}#create` },
];

/** Primary card: Window Peeper on its canonical path, scrolled to create. */
export const EFFECTS_ANNOUNCE_PRIMARY_HREF = EFFECTS_ANNOUNCE_CARDS[0]!.href;

/** Second card: Burning Bridges, a live effect with its own landing. */
export const EFFECTS_ANNOUNCE_SECONDARY_HREF = EFFECTS_ANNOUNCE_CARDS[1]!.href;

export const EFFECTS_ANNOUNCE_WINDOW_PEEPER_PATH = WINDOW_PEEPER_PATH;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function shouldShowEffectsAnnounce(
  storage: StorageLike | null | undefined
): boolean {
  if (!storage) return false;
  try {
    return !storage.getItem(EFFECTS_ANNOUNCE_STORAGE_KEY);
  } catch {
    return false;
  }
}

export function markEffectsAnnounceSeen(
  storage: StorageLike | null | undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(EFFECTS_ANNOUNCE_STORAGE_KEY, '1');
  } catch {
    // Private-mode storage failures must never break the page.
  }
}
