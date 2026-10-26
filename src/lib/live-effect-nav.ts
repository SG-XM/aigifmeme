import { LIVE_EFFECTS, type LiveEffectId } from '@/lib/ai-video-paths';
import { m } from '@/paraglide/messages.js';

/** Titles already used by the homepage scene cards, plus a short chip label. */
export function liveEffectTitle(id: LiveEffectId): string {
  if (id === 'bridges') return m['trend.bridges.title']();
  if (id === 'peeper') return m['trend.peeper.title']();
  if (id === 'sorry') return m['sorry.shortNav']();
  return m['trend.bulin.title']();
}

export function liveEffectShortTitle(id: LiveEffectId): string {
  if (id === 'bridges') return m['landing.nav.bridges_short']();
  if (id === 'peeper') return m['landing.nav.peeper_short']();
  if (id === 'sorry') return m['sorry.shortNav']();
  return m['landing.nav.bulin_short']();
}

/** Mobile header chips. Page titles keep the full names. */
export function liveEffectChipLabel(id: LiveEffectId): string {
  if (id === 'bridges') return m['landing.nav.chip_bridges']();
  if (id === 'peeper') return m['landing.nav.chip_peeper']();
  if (id === 'sorry') return m['landing.nav.chip_sorry']();
  return m['landing.nav.chip_bulin']();
}

/** Shared name + href for the header and the homepage scene cards. */
export function liveEffectNav() {
  return LIVE_EFFECTS.map((effect) => ({
    ...effect,
    title: liveEffectTitle(effect.id),
    shortTitle: liveEffectShortTitle(effect.id),
    chipLabel: liveEffectChipLabel(effect.id),
  }));
}
