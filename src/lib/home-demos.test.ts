import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
      'uptown-demo-ceo-hallelujah-v1',
      'uptown-demo-ceo-dutch-v1',
      'uptown-demo-zhaobenshan-v1',
      'uptown-demo-ceo-justwatch-v1',
    ]);
    expect(english.hero.map((clip) => clip.title)).toEqual([
      'CEO crew AI video example',
      'Street dance AI video example',
      'Ivory Mountain remake AI example',
      'Just Watch AI video example',
    ]);
    expect(english.hero[0]).toEqual({
      id: 'uptown-demo-ceo-hallelujah-v1',
      src: '/videos/showcase/home/uptown-demo-ceo-hallelujah-v1.mp4',
      poster: '/videos/showcase/home/uptown-demo-ceo-hallelujah-v1.jpg',
      title: 'CEO crew AI video example',
    });
    for (const clip of HOME_HERO_DEMOS) {
      expect(clip.src).toBe(`/videos/showcase/home/${clip.id}.mp4`);
      expect(clip.poster).toBe(`/videos/showcase/home/${clip.id}.jpg`);
      for (const url of [clip.src, clip.poster]) {
        if (!url) continue;
        expect(url.startsWith('/videos/showcase/home/')).toBe(true);
        expect(url).not.toMatch(/r2\.dev|airapduo\.io|tiktok|demo-0[45]/i);
        expect(existsSync(resolve(ROOT, 'public', url.slice(1)))).toBe(true);
      }
    }
    expect(homeDemoClips('zh').hero.map((clip) => clip.title)).toEqual([
      'CEO 团队 AI 视频示例',
      '街舞 AI 视频示例',
      '象牙山重制 AI 示例',
      'Just Watch AI 视频示例',
    ]);
    expect(homeDemoClips('es').hero[2]?.title).toBe(
      'Ejemplo de remake IA de Ivory Mountain'
    );
    expect(homeDemoClips('ar').hero[3]?.title).toBe(
      'مثال فيديو AI: Just Watch'
    );
  });
});
