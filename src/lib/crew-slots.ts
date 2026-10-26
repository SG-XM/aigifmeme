/** Homepage crew lineup: five places, center is the lead. */
export const CREW_SLOT_KEYS = [
  'farLeft',
  'left',
  'center',
  'right',
  'farRight',
] as const;

export type CrewSlotKey = (typeof CREW_SLOT_KEYS)[number];

/** First photo is the center lead, then the near sides, then the outer sides. */
export const CREW_FILL_ORDER: readonly CrewSlotKey[] = [
  'center',
  'left',
  'right',
  'farLeft',
  'farRight',
];

export const CREW_SLOT_LIMIT = CREW_SLOT_KEYS.length;

export const HOMEPAGE_CLIP_SECONDS = [12, 15] as const;
export type HomepageClipSeconds = (typeof HOMEPAGE_CLIP_SECONDS)[number];
export const DEFAULT_HOMEPAGE_CLIP_SECONDS: HomepageClipSeconds = 15;

export function homepageClipSeconds(value: number): HomepageClipSeconds {
  return value === 12 ? 12 : DEFAULT_HOMEPAGE_CLIP_SECONDS;
}

export type CrewSlotMap<T> = Partial<Record<CrewSlotKey, T>>;

/**
 * Place newly picked photos into the five crew slots.
 * `target` receives the first photo (replacing whatever was there).
 * Further photos fill empty slots, lead first.
 * Photos that do not fit are counted in `dropped`.
 */
export function placeCrewPhotos<T>(
  current: CrewSlotMap<T>,
  incoming: readonly T[],
  target?: CrewSlotKey
): { slots: CrewSlotMap<T>; dropped: number } {
  const slots: CrewSlotMap<T> = { ...current };
  const queue = [...incoming];
  if (target && queue.length) slots[target] = queue.shift() as T;
  for (const key of CREW_FILL_ORDER) {
    if (!queue.length) break;
    if (slots[key] !== undefined) continue;
    slots[key] = queue.shift() as T;
  }
  return { slots, dropped: queue.length };
}

/** Single mode keeps the center lead. Multi keeps every filled slot. */
export function crewSlotRecord<T>(
  slots: CrewSlotMap<T>,
  lineup: 'single' | 'multi'
): CrewSlotMap<T> {
  if (lineup === 'single') {
    return slots.center !== undefined ? { center: slots.center } : {};
  }
  const next: CrewSlotMap<T> = {};
  for (const key of CREW_SLOT_KEYS) {
    if (slots[key] !== undefined) next[key] = slots[key];
  }
  return next;
}

/** Reference photos sent with a crew job. A sixth photo is not forwarded. */
export function capReferenceImageUrls<T>(urls: readonly T[]): T[] {
  return urls.slice(0, CREW_SLOT_LIMIT);
}
