import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SOLO_DEMO } from '@/lib/bulin-reference';

import { HOME_HERO_DEMOS, homeDemoClips, homeDemoTitle } from './home-demos';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('homeDemoTitle', () => {
  const row = {
    title: 'English',
    titleZh: '中文',
    titleAr: '',
    titleEs: 'Español',
  };

  it('uses the locale column when it has text', () => {
    expect(homeDemoTitle(row, 'zh')).toBe('中文');
    expect(homeDemoTitle(row, 'es')).toBe('Español');
  });

  it('falls back to the default title', () => {
    expect(homeDemoTitle(row, 'en')).toBe('English');
    expect(homeDemoTitle(row, 'ar')).toBe('English');
  });
});

describe('homeDemoClips', () => {
  it('ships the live homepage hero and an empty gallery', () => {
    const english = homeDemoClips('en');
    expect(english.gallery).toEqual([]);
    expect(english.hero.map((clip) => clip.id)).toEqual([
      'retention-werewolf-dance-v1',
      'seed-hero-1',
      'seed-hero-2',
      'seed-hero-3',
      'seed-hero-4',
      'seed-hero-5',
    ]);
    expect(english.hero[0]).toEqual({
      id: 'retention-werewolf-dance-v1',
      src: SOLO_DEMO.src,
      poster: SOLO_DEMO.poster,
      title: 'Werewolf dance example',
    });
    expect(english.hero[1]).toEqual({
      id: 'seed-hero-1',
      src: '/videos/showcase/home/7693717519374224672.mp4',
      title: 'Freestyle example 1',
    });
    expect(english.hero[4]?.src).toBe(
      '/videos/showcase/home/bulin-trio-hero-original-v1.mp4'
    );
    expect(english.hero[4]?.poster).toBe(
      '/videos/showcase/home/bulin-trio-hero-original-v1.jpg'
    );
    for (const clip of HOME_HERO_DEMOS) {
      for (const url of [clip.src, clip.poster]) {
        if (!url) continue;
        expect(url.startsWith('/videos/')).toBe(true);
        expect(url).not.toMatch(/r2\.dev|airapduo\.io/);
        expect(existsSync(resolve(ROOT, 'public', url.slice(1)))).toBe(true);
      }
    }
    expect(english.hero[5]?.title).toBe('Dame Hombro trio — street take');
    expect(homeDemoClips('zh').hero[0]?.title).toBe('狼人舞蹈示例');
    expect(homeDemoClips('es').hero[4]?.title).toBe(
      'Trío Dame Hombro — el original'
    );
    expect(homeDemoClips('ar').hero[5]?.title).toBe(
      'ثلاثي Dame Hombro — نسخة الشارع'
    );
  });
});
