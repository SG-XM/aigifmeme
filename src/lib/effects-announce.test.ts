import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { creditsForGeneration } from '@/lib/agent-settings';
import {
  effectHash,
  IM_SO_SORRY_PATH,
  WINDOW_PEEPER_PATH,
} from '@/lib/ai-video-paths';
import { BURNING_BRIDGES_REFERENCE } from '@/lib/burning-bridges-reference';

import {
  EFFECTS_ANNOUNCE_BRIDGES_VIDEO,
  EFFECTS_ANNOUNCE_CARDS,
  EFFECTS_ANNOUNCE_MORE,
  EFFECTS_ANNOUNCE_PEEPER_VIDEO,
  EFFECTS_ANNOUNCE_PRIMARY_HREF,
  EFFECTS_ANNOUNCE_SECONDARY_HREF,
  EFFECTS_ANNOUNCE_STORAGE_KEY,
  markEffectsAnnounceSeen,
  shouldShowEffectsAnnounce,
} from './effects-announce';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCALES = ['en', 'zh', 'es', 'ar'] as const;
const COPY_KEYS = [
  'announce.effects.badge',
  'announce.effects.kicker',
  'announce.effects.title_before',
  'announce.effects.title_mark',
  'announce.effects.title_after',
  'announce.effects.description',
  'announce.effects.close',
  'announce.effects.keep',
  'announce.effects.more',
  'announce.effects.new',
  'announce.effects.media_label',
  'announce.effects.meta',
  'announce.effects.peeper.title',
  'announce.effects.peeper.body',
  'announce.effects.peeper.cta',
  'announce.effects.peeper.duration',
  'announce.effects.bridges.title',
  'announce.effects.bridges.body',
  'announce.effects.bridges.cta',
  'announce.effects.bridges.duration',
  'announce.effects.more.bulin',
  'announce.effects.more.sorry',
] as const;

/** Unfinished, placeholder, or pending-research language is not publishable. */
const BANNED_COPY =
  /chatgpt|pending at publish|placeholder|coming soon|unfinished|lorem ipsum|\btodo\b|\btbd\b|待完成|占位|即将推出|pendiente al publicar|próximamente|not yet listed|still being added|قريبًا/i;

const CURTAIN = {
  en: /curtain/i,
  zh: /窗帘/,
  es: /cortina/i,
  ar: /الستارة/,
} as const;

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function catalog(locale: (typeof LOCALES)[number]) {
  return JSON.parse(
    readFileSync(resolve(ROOT, 'messages', `${locale}.json`), 'utf8')
  ) as Record<string, string>;
}

describe('effects announce flag', () => {
  it('shows on first visit and never after it is marked seen', () => {
    const storage = fakeStorage();
    expect(shouldShowEffectsAnnounce(storage)).toBe(true);
    markEffectsAnnounceSeen(storage);
    expect(storage.getItem(EFFECTS_ANNOUNCE_STORAGE_KEY)).toBe('1');
    expect(shouldShowEffectsAnnounce(storage)).toBe(false);
    markEffectsAnnounceSeen(storage);
    expect(shouldShowEffectsAnnounce(storage)).toBe(false);
  });

  it('does not show when the flag already exists', () => {
    expect(
      shouldShowEffectsAnnounce(
        fakeStorage({ [EFFECTS_ANNOUNCE_STORAGE_KEY]: '1' })
      )
    ).toBe(false);
  });

  it('stays hidden without usable storage', () => {
    expect(shouldShowEffectsAnnounce(null)).toBe(false);
    expect(shouldShowEffectsAnnounce(undefined)).toBe(false);
    markEffectsAnnounceSeen(null);
    const denied = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(shouldShowEffectsAnnounce(denied)).toBe(false);
    expect(() => markEffectsAnnounceSeen(denied)).not.toThrow();
  });

  it('points the two cards at live create paths', () => {
    expect(EFFECTS_ANNOUNCE_PRIMARY_HREF).toBe(effectHash('peeper', 'create'));
    expect(EFFECTS_ANNOUNCE_PRIMARY_HREF).toBe(`${WINDOW_PEEPER_PATH}#create`);
    expect(EFFECTS_ANNOUNCE_PRIMARY_HREF.startsWith(WINDOW_PEEPER_PATH)).toBe(
      true
    );
    expect(EFFECTS_ANNOUNCE_PRIMARY_HREF).not.toContain(
      '/ai-video/window-peeper'
    );
    expect(EFFECTS_ANNOUNCE_SECONDARY_HREF).toBe(
      effectHash('bridges', 'create')
    );
    expect(EFFECTS_ANNOUNCE_SECONDARY_HREF).toBe('/burning-bridges-ai#create');
    expect(EFFECTS_ANNOUNCE_MORE.map((item) => item.href)).toEqual([
      effectHash('bulin', 'create'),
      `${IM_SO_SORRY_PATH}#create`,
    ]);
  });

  it('uses same-origin previews instead of the multi-megabyte masters', () => {
    const [peeper, bridges] = EFFECTS_ANNOUNCE_CARDS;
    expect(peeper?.id).toBe('peeper');
    expect(peeper?.isNew).toBe(true);
    expect(peeper?.src).toBe(EFFECTS_ANNOUNCE_PEEPER_VIDEO);
    expect(peeper?.src).toBe(
      '/videos/showcase/window-peeper/announce-preview.mp4'
    );
    expect(peeper?.src).not.toContain('r2.dev');
    expect(peeper?.credits).toBe(
      creditsForGeneration('seedance-2-mini', 12, '480p')
    );
    expect(peeper?.credits).toBe(5);
    expect(bridges?.id).toBe('bridges');
    expect(bridges?.isNew).toBe(false);
    expect(bridges?.src).toBe(EFFECTS_ANNOUNCE_BRIDGES_VIDEO);
    expect(bridges?.src).toBe(
      '/videos/showcase/burning-bridges/announce-preview.mp4'
    );
    expect(bridges?.src).not.toContain('airapduo.io');
    for (const card of [peeper, bridges]) {
      const file = resolve(ROOT, 'public', card!.src.slice(1));
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(400_000);
    }
    expect(bridges?.credits).toBe(
      creditsForGeneration(
        'seedance-2-mini',
        BURNING_BRIDGES_REFERENCE.durationSeconds,
        '480p'
      )
    );
    expect(bridges?.credits).toBe(7);
    expect(existsSync(resolve(ROOT, 'public', peeper!.poster.slice(1)))).toBe(
      true
    );
    expect(existsSync(resolve(ROOT, 'public', bridges!.poster.slice(1)))).toBe(
      true
    );
  });
});

describe('effects announce copy', () => {
  it('announces Window Peeper as live in every locale without unfinished language', () => {
    for (const locale of LOCALES) {
      const messages = catalog(locale);
      for (const key of COPY_KEYS) {
        const value = messages[key];
        expect(value, `${locale} ${key}`).toEqual(expect.any(String));
        if (key !== 'announce.effects.title_before') {
          expect(value.trim().length, `${locale} ${key}`).toBeGreaterThan(1);
        }
        expect(value, `${locale} ${key}`).not.toMatch(BANNED_COPY);
      }
      const headline = `${messages['announce.effects.title_before']}${messages['announce.effects.title_mark']}${messages['announce.effects.title_after']}`;
      expect(messages['announce.effects.title_mark']).toBe('Window Peeper');
      expect(headline).toContain('Window Peeper');
      expect(messages['announce.effects.description']).toMatch(CURTAIN[locale]);
      expect(messages['announce.effects.peeper.body']).toMatch(CURTAIN[locale]);
      expect(messages['announce.effects.peeper.duration']).toMatch(/12/);
      expect(messages['announce.effects.peeper.duration']).toMatch(/15/);
      expect(messages['announce.effects.bridges.duration']).toMatch(/15/);
      expect(messages['announce.effects.bridges.duration']).not.toMatch(/12/);
      expect(messages['announce.effects.meta']).toContain('{duration}');
      expect(messages['announce.effects.meta']).toContain('{credits}');
      expect(messages['announce.effects.more.sorry']).toBe("I'm So Sorry");
      expect(messages['announce.effects.more.sorry']).not.toMatch(
        /video|视频|فيديو/i
      );
      expect(messages['announce.effects.bridges.body']).not.toMatch(/tiktok/i);
    }
  });
});
