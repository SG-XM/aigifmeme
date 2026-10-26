export type EffectCampaign = 'bulin' | 'bridges' | 'peeper';

/** Header and scene-list ids. Sorry is a photo set, not a video campaign. */
export type LiveEffectId = EffectCampaign | 'sorry';

export const AI_VIDEO_INDEX_PATH = '/ai-video' as const;
export const WINDOW_PEEPER_PATH = '/window-peeper' as const;
/** Previous public URL. The route 301s to `WINDOW_PEEPER_PATH`. */
export const WINDOW_PEEPER_AI_VIDEO_PATH = '/ai-video/window-peeper' as const;
/** Earlier public alias. The route 301s to `WINDOW_PEEPER_PATH`. */
export const WINDOW_PEEPER_LEGACY_PATH = '/window-peeper-ai' as const;
export const IM_SO_SORRY_PATH = '/im-so-sorry' as const;

const WINDOW_PEEPER_PATHS = [
  WINDOW_PEEPER_PATH,
  WINDOW_PEEPER_AI_VIDEO_PATH,
  WINDOW_PEEPER_LEGACY_PATH,
] as const;

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function effectPath(campaign: EffectCampaign): string {
  if (campaign === 'bridges') return '/burning-bridges-ai';
  if (campaign === 'peeper') return WINDOW_PEEPER_PATH;
  return '/';
}

export function effectHash(campaign: EffectCampaign, hash: string): string {
  return `${effectPath(campaign)}#${hash}`;
}

export interface LiveEffect {
  id: LiveEffectId;
  /** Scene page. Header nav uses this. */
  href: string;
  /** Same scene, scrolled to the generator. Homepage cards use this. */
  createHref: string;
  isCurrent: (pathname: string) => boolean;
}

/**
 * The only effects shown in the header and on the homepage scene list.
 * Name strings live in `liveEffectNav()` so labels stay on the same keys
 * the cards already use. Add a scene here only after its page is live.
 */
export const LIVE_EFFECTS: readonly LiveEffect[] = [
  {
    id: 'bulin',
    href: effectPath('bulin'),
    createHref: effectHash('bulin', 'create'),
    isCurrent: (pathname) => pathname === '/' || pathname === '/bulin-47-ai',
  },
  {
    id: 'bridges',
    href: effectPath('bridges'),
    createHref: effectHash('bridges', 'create'),
    isCurrent: (pathname) =>
      pathname === '/burning-bridges-ai' ||
      pathname.startsWith('/burning-bridges-ai/'),
  },
  {
    id: 'peeper',
    href: effectPath('peeper'),
    createHref: effectHash('peeper', 'create'),
    isCurrent: (pathname) =>
      WINDOW_PEEPER_PATHS.some((path) => matchesPath(pathname, path)),
  },
  {
    id: 'sorry',
    href: IM_SO_SORRY_PATH,
    createHref: `${IM_SO_SORRY_PATH}#create`,
    isCurrent: (pathname) =>
      pathname === IM_SO_SORRY_PATH ||
      pathname.startsWith(`${IM_SO_SORRY_PATH}/`),
  },
];

const EFFECTS_NAV_EXACT = new Set(['/', '/bulin-47-ai']);

/**
 * Routes where the shared Effects item is current: Bulin home and its alias,
 * Burning Bridges, Window Peeper (including both legacy URLs), I'm So Sorry,
 * and the /ai-video hub.
 */
export function isEffectsNavPath(pathname: string): boolean {
  if (EFFECTS_NAV_EXACT.has(pathname)) return true;
  const prefixes = [
    '/burning-bridges-ai',
    AI_VIDEO_INDEX_PATH,
    WINDOW_PEEPER_PATH,
    WINDOW_PEEPER_LEGACY_PATH,
    IM_SO_SORRY_PATH,
  ];
  return prefixes.some((path) => matchesPath(pathname, path));
}
