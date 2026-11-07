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
  it('ships sticker and GIF placeholders and an empty gallery', () => {
    const english = homeDemoClips('en');
    expect(english.gallery).toEqual([]);
    expect(english.hero.map((clip) => clip.id)).toEqual([
      'reaction-sticker',
      'caption-loop',
      'pet-meme',
      'poster-sticker',
    ]);
    expect(english.hero.map((clip) => clip.title)).toEqual([
      'Reaction sticker',
      'Caption GIF loop',
      'Pet meme sticker',
      'Poster sticker',
    ]);
    expect(english.hero[1]).toEqual({
      id: 'caption-loop',
      src: '/images/stickers/caption-loop.gif',
      poster: '/images/stickers/caption-loop.png',
      title: 'Caption GIF loop',
    });
    for (const clip of HOME_HERO_DEMOS) {
      expect(clip.src.startsWith('/images/stickers/')).toBe(true);
      expect(clip.src).not.toMatch(/uptown|bulin|showcase\/home|r2\.dev/i);
      for (const url of [clip.src, clip.poster]) {
        if (!url) continue;
        expect(existsSync(resolve(ROOT, 'public', url.slice(1)))).toBe(true);
      }
    }
    expect(homeDemoClips('zh').hero.map((clip) => clip.title)).toEqual([
      '反应贴纸',
      '字幕 GIF 循环',
      '宠物梗图贴纸',
      '海报贴纸',
    ]);
    expect(homeDemoClips('es').hero[2]?.title).toBe(
      'Sticker de meme con mascota'
    );
    expect(homeDemoClips('ar').hero[3]?.title).toBe('ملصق بوستر');
  });
});
