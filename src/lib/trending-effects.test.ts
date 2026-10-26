import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LIVE_EFFECTS } from '@/lib/ai-video-paths';
import { SOLO_DEMO } from '@/lib/bulin-reference';
import { SORRY_DEMO_STATIC_PATHS } from '@/lib/im-so-sorry-demos';
import { WINDOW_PEEPER_RESULT } from '@/lib/window-peeper-reference';

import { TRENDING_EFFECT_LIMIT, trendingEffects } from './trending-effects';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCALES = ['en', 'zh', 'es', 'ar'] as const;
const COPY_KEYS = [
  'trending.button',
  'trending.button_label',
  'trending.chip',
  'trending.title',
  'trending.lede',
  'trending.new',
  'trending.sorry.hook',
  'trending.sorry.cta',
  'trending.peeper.hook',
  'trending.peeper.cta',
  'trending.bridges.hook',
  'trending.bridges.cta',
  'trending.bulin.hook',
  'trending.bulin.cta',
] as const;

const BANNED_COPY =
  /chatgpt|pending at publish|placeholder|coming soon|unfinished|lorem ipsum|\btodo\b|\btbd\b|待完成|占位|即将推出|pendiente al publicar|próximamente|not yet listed|still being added|قريبًا/i;

function catalog(locale: (typeof LOCALES)[number]) {
  return JSON.parse(
    readFileSync(resolve(ROOT, 'messages', `${locale}.json`), 'utf8')
  ) as Record<string, string>;
}

describe('trending effects', () => {
  it('lists exactly four live scenes, newest first', () => {
    const effects = trendingEffects();
    const newest = [...LIVE_EFFECTS].reverse().slice(0, TRENDING_EFFECT_LIMIT);

    expect(TRENDING_EFFECT_LIMIT).toBe(4);
    expect(effects).toHaveLength(4);
    expect(effects.map((effect) => effect.id)).toEqual([
      'sorry',
      'peeper',
      'bridges',
      'bulin',
    ]);
    expect(effects.map((effect) => effect.id)).toEqual(
      newest.map((effect) => effect.id)
    );

    for (const effect of effects) {
      const live = LIVE_EFFECTS.find((item) => item.id === effect.id);
      expect(effect.href).toBe(live?.createHref);
      expect(effect.href.startsWith('/')).toBe(true);
      expect(effect.href).not.toContain('/ai-video/window-peeper');
      expect(effect.href).not.toContain('/window-peeper-ai');
    }

    expect(effects.map((effect) => effect.href)).toEqual([
      '/im-so-sorry#create',
      '/window-peeper#create',
      '/burning-bridges-ai#create',
      '/#create',
    ]);
  });

  it('marks only the announced new effects and attaches real demo media', () => {
    const byId = Object.fromEntries(
      trendingEffects().map((effect) => [effect.id, effect])
    );

    expect(byId.sorry?.fresh).toBe(true);
    expect(byId.peeper?.fresh).toBe(true);
    expect(byId.bridges?.fresh).toBe(false);
    expect(byId.bulin?.fresh).toBe(false);
    expect(SORRY_DEMO_STATIC_PATHS[0]).toBe('/images/im-so-sorry/01-dream.jpg');
    expect(byId.sorry?.media).toEqual({
      kind: 'image',
      src: SORRY_DEMO_STATIC_PATHS[0],
    });

    expect(byId.peeper?.media).toEqual({
      kind: 'video',
      src: WINDOW_PEEPER_RESULT.src,
      poster: WINDOW_PEEPER_RESULT.poster,
    });
    expect(byId.bridges?.media).toEqual({
      kind: 'image',
      src: '/videos/showcase/burning-bridges/announce-man.jpg',
    });
    expect(byId.bulin?.media).toEqual({
      kind: 'video',
      src: SOLO_DEMO.src,
      poster: SOLO_DEMO.poster,
    });

    for (const effect of trendingEffects()) {
      if (!effect.media) continue;
      for (const url of [effect.media.src, effect.media.poster]) {
        if (!url || /^https?:/.test(url)) continue;
        expect(
          existsSync(resolve(ROOT, 'public', url.replace(/^\//, ''))),
          url
        ).toBe(true);
      }
    }
  });
});

describe('trending copy', () => {
  it('has button, popup, and per-card strings in every locale', () => {
    for (const locale of LOCALES) {
      const messages = catalog(locale);
      for (const key of COPY_KEYS) {
        const value = messages[key];
        expect(value, `${locale} ${key}`).toEqual(expect.any(String));
        expect(value.trim().length, `${locale} ${key}`).toBeGreaterThan(1);
        expect(value, `${locale} ${key}`).not.toMatch(BANNED_COPY);
      }
      expect(messages['announce.effects.close']?.trim().length).toBeGreaterThan(
        1
      );
    }
  });
});
