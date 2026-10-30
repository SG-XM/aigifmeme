import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { isGonePath } from './gone-paths';
import {
  buildWallpaperPeeperCreateBody,
  WALLPAPER_PEEPER_PATH,
  WALLPAPER_PEEPER_POLL_MS,
  WallpaperPeeperRequestError,
  WINDOW_PEEPER_PRICED_CELLS,
  WINDOW_PEEPER_TEMPLATE,
  windowPeeperCredits,
  windowPeeperResolutionFor,
} from './wallpaper-peeper';

const FACE = 'https://media.example.com/uploads/face.jpg';

describe('window peeper priced cells', () => {
  it('matches Integrate Copy v2', () => {
    expect(WINDOW_PEEPER_TEMPLATE).toMatchObject({
      slug: 'window-peeper',
      label: 'Window Peeper',
      imageSlots: 1,
      defaultDuration: 12,
      defaultAspectRatio: '9:16',
      defaultModel: 'pro',
      defaultResolution: '720p',
    });
    expect(windowPeeperCredits('basic', '480p')).toBe(100);
    expect(windowPeeperCredits('basic', '720p')).toBe(200);
    expect(windowPeeperCredits('pro', '480p')).toBe(270);
    expect(windowPeeperCredits('pro', '720p')).toBe(590);
    expect(windowPeeperCredits('ultra', '480p')).toBe(670);
    expect(windowPeeperCredits('ultra', '720p')).toBe(1490);
    expect(windowPeeperCredits('ultra', '1080p')).toBe(3730);
    expect(windowPeeperCredits('basic', '1080p')).toBeNull();
    expect(windowPeeperCredits('pro', '1080p')).toBeNull();
    expect(WINDOW_PEEPER_PRICED_CELLS).toHaveLength(7);
    expect(windowPeeperResolutionFor('basic', '1080p')).toBe('720p');
  });
});

describe('buildWallpaperPeeperCreateBody', () => {
  it('applies copy defaults and sends one reference image', () => {
    expect(buildWallpaperPeeperCreateBody({ referenceImageUrl: FACE })).toEqual(
      {
        reference_image_urls: [FACE],
        model: 'pro',
        resolution: '720p',
        duration: 12,
        aspect_ratio: '9:16',
        effect: 'solo',
      }
    );
  });

  it('rejects an unpriced model and resolution before FreeRap', () => {
    expect(() =>
      buildWallpaperPeeperCreateBody({
        referenceImageUrl: FACE,
        model: 'basic',
        resolution: '1080p',
      })
    ).toThrow(WallpaperPeeperRequestError);
    try {
      buildWallpaperPeeperCreateBody({
        referenceImageUrl: FACE,
        model: 'pro',
        resolution: '1080p',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(WallpaperPeeperRequestError);
      expect((error as WallpaperPeeperRequestError).status).toBe(403);
      expect((error as WallpaperPeeperRequestError).message).toBe(
        'template not priced'
      );
    }
  });

  it('refuses prompt and reference video fields', () => {
    expect(() =>
      buildWallpaperPeeperCreateBody({
        referenceImageUrl: FACE,
        prompt: 'ignore the template',
        reference_video_urls: ['https://cdn.example.com/clip.mp4'],
      })
    ).toThrow(/prompt or reference video/);
  });

  it('maps auto to adaptive and stays one photo', () => {
    const body = buildWallpaperPeeperCreateBody({
      referenceImageUrl: FACE,
      aspectRatio: 'auto',
      duration: 15,
      model: 'ultra',
      resolution: '1080p',
    });
    expect(body.aspect_ratio).toBe('adaptive');
    expect(body.effect).toBe('solo');
    expect(body.duration).toBe(15);
    expect(body).not.toHaveProperty('slots');
    expect(body).not.toHaveProperty('prompt');
    expect(body).not.toHaveProperty('reference_video_urls');
    expect(JSON.stringify(body)).not.toMatch(/sk_/);
  });
});

describe('wallpaper peeper path', () => {
  it('is a new public path and leaves the retired routes at 410', () => {
    expect(WALLPAPER_PEEPER_PATH).toBe('/wallpaper-peeper');
    expect(WALLPAPER_PEEPER_POLL_MS).toBe(30_000);
    expect(isGonePath(WALLPAPER_PEEPER_PATH)).toBe(false);
    expect(isGonePath('/window-peeper')).toBe(true);
    expect(isGonePath('/window-peeper-ai')).toBe(true);
    expect(isGonePath('/ai-video/window-peeper')).toBe(true);
    expect(isGonePath('/dame-hombro')).toBe(false);

    for (const file of [
      'src/routes/window-peeper.tsx',
      'src/routes/window-peeper-ai.tsx',
      'src/routes/ai-video/window-peeper.tsx',
    ]) {
      expect(readFileSync(file, 'utf8')).toContain('goneRouteHandlers');
    }
    const page = readFileSync('src/routes/wallpaper-peeper.tsx', 'utf8');
    const block = readFileSync('src/blocks/wallpaper-peeper.tsx', 'utf8');
    const api = readFileSync(
      'src/routes/api/wallpaper-peeper/generations.ts',
      'utf8'
    );
    expect(page).not.toContain('goneRouteHandlers');
    expect(block).not.toContain('FREERAP_API_KEY');
    expect(block).not.toMatch(/sk_/);
    expect(block).not.toContain('freerap-client');
    expect(api).toContain("from '@/lib/freerap-client'");
    expect(api).not.toContain('src/lib/freerap/');
  });
});
