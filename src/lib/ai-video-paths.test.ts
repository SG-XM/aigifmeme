import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  effectPath,
  IM_SO_SORRY_PATH,
  isEffectsNavPath,
  LIVE_EFFECTS,
  WINDOW_PEEPER_PATH,
} from './ai-video-paths';

describe('isEffectsNavPath', () => {
  it('marks Bulin, Bridges, Peeper, and the effects hub as current', () => {
    for (const pathname of [
      '/',
      '/bulin-47-ai',
      '/burning-bridges-ai',
      '/ai-video',
      '/ai-video/',
      '/window-peeper',
      '/window-peeper/',
      '/ai-video/window-peeper',
      '/window-peeper-ai',
      '/im-so-sorry',
      '/im-so-sorry/',
    ]) {
      expect(isEffectsNavPath(pathname), pathname).toBe(true);
    }
  });

  it('leaves pricing, library, and the rest of the app alone', () => {
    for (const pathname of [
      '/pricing',
      '/library',
      '/blog',
      '/blog/how-to',
      '/create',
      '/chat',
      '/settings',
      '/burning-bridges',
      '/ai-video-extra',
      '/window-peeper-extra',
    ]) {
      expect(isEffectsNavPath(pathname), pathname).toBe(false);
    }
  });
});

describe('LIVE_EFFECTS', () => {
  it('lists the live scenes in header order', () => {
    expect(LIVE_EFFECTS.map((effect) => effect.id)).toEqual([
      'bulin',
      'bridges',
      'peeper',
      'sorry',
    ]);
    expect(effectPath('peeper')).toBe(WINDOW_PEEPER_PATH);
    expect(WINDOW_PEEPER_PATH).toBe('/window-peeper');
    expect(LIVE_EFFECTS.map((effect) => effect.href)).toEqual([
      effectPath('bulin'),
      effectPath('bridges'),
      effectPath('peeper'),
      IM_SO_SORRY_PATH,
    ]);
    expect(LIVE_EFFECTS.map((effect) => effect.createHref)).toEqual([
      `${effectPath('bulin')}#create`,
      `${effectPath('bridges')}#create`,
      `${effectPath('peeper')}#create`,
      `${IM_SO_SORRY_PATH}#create`,
    ]);
  });

  it('marks only that effect’s own scene as current', () => {
    const current = (pathname: string) =>
      LIVE_EFFECTS.filter((effect) => effect.isCurrent(pathname)).map(
        (effect) => effect.id
      );

    expect(current('/')).toEqual(['bulin']);
    expect(current('/bulin-47-ai')).toEqual(['bulin']);
    expect(current('/burning-bridges-ai')).toEqual(['bridges']);
    expect(current('/window-peeper')).toEqual(['peeper']);
    expect(current('/window-peeper/extra')).toEqual(['peeper']);
    expect(current('/ai-video/window-peeper')).toEqual(['peeper']);
    expect(current('/window-peeper-ai')).toEqual(['peeper']);
    expect(current('/im-so-sorry')).toEqual(['sorry']);
    expect(current('/im-so-sorry/extra')).toEqual(['sorry']);
    expect(current('/pricing')).toEqual([]);
    expect(current('/ai-video')).toEqual([]);
    expect(current('/library')).toEqual([]);
  });

  it("keeps the fourth header label exactly I'm So Sorry in every locale", () => {
    for (const locale of ['en', 'zh', 'es', 'ar']) {
      const messages = JSON.parse(
        readFileSync(
          new URL(`../../messages/${locale}.json`, import.meta.url),
          'utf8'
        )
      ) as Record<string, string>;
      expect(messages['sorry.shortNav'], locale).toBe("I'm So Sorry");
    }
  });

  it('uses one-thumb chip labels and leaves page titles alone', () => {
    for (const locale of ['en', 'zh', 'es', 'ar']) {
      const messages = JSON.parse(
        readFileSync(
          new URL(`../../messages/${locale}.json`, import.meta.url),
          'utf8'
        )
      ) as Record<string, string>;
      expect(messages['landing.nav.chip_bulin'], locale).toBe('Bulin');
      expect(messages['landing.nav.chip_bridges'], locale).toBe('Bridges');
      expect(messages['landing.nav.chip_peeper'], locale).toBe('Peeper');
      expect(messages['landing.nav.chip_sorry'], locale).toBe('Sorry');
      expect(messages['landing.nav.bulin_short'], locale).toBe('Bulin 47');
      expect(messages['sorry.shortNav'], locale).toBe("I'm So Sorry");
    }
  });
});
