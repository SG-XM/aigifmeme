import { createRequire } from 'node:module';
import { encode as encodePng } from 'fast-png';
import { describe, expect, it, vi } from 'vitest';

import {
  filterPublicConfigs,
  isSecretConfigKey,
  maskConfigValue,
} from '@/modules/config/service';
import { PUBLIC_CONFIG_KEYS } from '@/lib/public-config-keys';

import { assembleStickerGif } from './assemble';
import { gifPackDayKey } from './options';
import { anchorPrompt, sheetPrompt } from './prompts';
import {
  imageEditRequest,
  requestImageEdit,
  resolveGifPackProvider,
} from './provider';
import { decodeRaster } from './raster';
import { gridEdges, sliceSheet } from './sprite';
import { assertPublicProviderBase } from './ssrf';
import { inspectSubject } from './subject';
import { overlayCaption } from './text';
import { unzipStored, zipStored } from './zip';

const require = createRequire(import.meta.url);
const { GifReader } = require('omggif') as {
  GifReader: new (buf: Uint8Array) => {
    width: number;
    height: number;
    numFrames: () => number;
    loopCount: () => number;
    frameInfo: (i: number) => { delay: number; transparent_index: number };
    decodeAndBlitFrameRGBA: (i: number, pixels: Uint8Array) => void;
  };
};

const FIXTURE = 'test-fixture-not-a-model-output';

function png(width: number, height: number, paint: (rgba: Uint8Array) => void) {
  const rgba = new Uint8Array(width * height * 4);
  paint(rgba);
  return encodePng({ width, height, data: rgba, channels: 4, depth: 8 });
}

function movingSheet() {
  const cells = 4;
  const cell = 32;
  const size = cells * cell;
  return png(size, size, (rgba) => {
    for (let frame = 0; frame < 16; frame += 1) {
      const col = frame % cells;
      const row = Math.floor(frame / cells);
      for (let y = 0; y < cell; y += 1) {
        for (let x = 0; x < cell; x += 1) {
          const o = ((row * cell + y) * size + col * cell + x) * 4;
          rgba[o] = 255;
          rgba[o + 2] = 255;
          rgba[o + 3] = 255;
        }
      }
      const width = 4 + frame;
      for (let y = 8; y < 22; y += 1) {
        for (
          let x = 16 - Math.floor(width / 2);
          x < 16 + Math.ceil(width / 2);
          x += 1
        ) {
          const o = ((row * cell + y) * size + col * cell + x) * 4;
          rgba[o] = 10;
          rgba[o + 1] = 10;
          rgba[o + 2] = 10;
          rgba[o + 3] = 255;
        }
      }
    }
  });
}

describe('GIF pack calendar quota', () => {
  it('uses the Asia/Shanghai calendar, including the UTC evening boundary', () => {
    expect(gifPackDayKey(new Date('2026-11-08T15:30:00Z'))).toBe('2026-11-08');
    expect(gifPackDayKey(new Date('2026-11-08T16:30:00Z'))).toBe('2026-11-09');
  });
});

describe('provider contract', () => {
  it('pins gpt-image-2 on JSON /images/edits and does not fall back', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      if (calls.length === 1) {
        return new Response('nope sk-live-secret-value-should-not-leak', {
          status: 500,
        });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: btoa('png'),
              url: 'https://api.aigifmeme.com/secret-file',
            },
          ],
        }),
        { status: 200 }
      );
    });
    const config = resolveGifPackProvider({
      gif_pack_base_url: 'https://api.aigifmeme.com/v1',
      gif_pack_api_key: 'test-fixture-key-not-a-real-token',
      gif_pack_image_model: '',
    });
    await expect(
      requestImageEdit(
        config,
        new Uint8Array([1, 2, 3]),
        'circle',
        'a.png',
        fetchImpl
      )
    ).rejects.toThrow(/HTTP 500(?![\s\S]*sk-live)/);
    await requestImageEdit(
      config,
      new Uint8Array([1, 2, 3]),
      'circle',
      'a.png',
      fetchImpl
    );
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe('https://api.aigifmeme.com/v1/images/edits');
      const body = JSON.parse(call.body);
      expect(body.model).toBe('gpt-image-2');
      expect(body.n).toBe(1);
      expect(body.size).toBe('1024x1024');
      expect(body.quality).toBe('low');
      expect(body.response_format).toBe('b64_json');
      expect(body.images[0].b64_json).toBeTruthy();
      expect(body.images[0].mime_type).toBe('image/png');
      expect(call.url).not.toContain('/images/generations');
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refuses any model other than gpt-image-2 before calling the network', () => {
    expect(() =>
      resolveGifPackProvider({
        gif_pack_api_key: 'secret',
        gif_pack_image_model: 'dall-e-3',
      })
    ).toThrow(/gpt-image-2/);
    const body = imageEditRequest(new Uint8Array([1]), 'prompt', 'a.png');
    expect(body.model).toBe('gpt-image-2');
  });

  it('blocks private provider bases and redirects', async () => {
    for (const base of [
      'http://api.aigifmeme.com/v1',
      'https://127.0.0.1/v1',
      'https://169.254.169.254/v1',
      'https://localhost/v1',
      'https://10.0.0.8/v1',
    ]) {
      expect(() => assertPublicProviderBase(base)).toThrow();
    }
    expect(
      assertPublicProviderBase('https://api.aigifmeme.com/v1').hostname
    ).toBe('api.aigifmeme.com');
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/' },
        })
    );
    await expect(
      requestImageEdit(
        {
          baseUrl: 'https://api.aigifmeme.com/v1',
          apiKey: 'test-key',
          model: 'gpt-image-2',
        },
        new Uint8Array([1]),
        'prompt',
        'a.png',
        fetchImpl
      )
    ).rejects.toThrow(/redirect/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the key out of public settings JSON', () => {
    expect(isSecretConfigKey('gif_pack_api_key')).toBe(true);
    expect(maskConfigValue('sk-live-secret-value')).toBe('••••••••alue');
    expect(maskConfigValue('sk-live-secret-value')).not.toContain('sk-live');
    const filtered = filterPublicConfigs(
      {
        app_name: 'AIGifMeme',
        gif_pack_api_key: 'sk-live-secret-value',
        gif_pack_base_url: 'https://api.aigifmeme.com/v1',
        gif_pack_image_model: 'gpt-image-2',
      },
      [...PUBLIC_CONFIG_KEYS, 'gif_pack_api_key', 'gif_pack_base_url']
    );
    expect(filtered).toEqual({ app_name: 'AIGifMeme' });
    expect(JSON.stringify(PUBLIC_CONFIG_KEYS)).not.toContain('gif_pack');
  });
});

describe(`${FIXTURE} subject selection`, () => {
  it('crops the main object and rejects a blank or ambiguous image', () => {
    const dog = png(96, 96, (rgba) => {
      rgba.fill(255);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      for (let y = 30; y < 70; y += 1) {
        for (let x = 34; x < 62; x += 1) {
          const o = (y * 96 + x) * 4;
          rgba[o] = 20;
          rgba[o + 1] = 20;
          rgba[o + 2] = 20;
        }
      }
    });
    const found = inspectSubject(dog, 'image/png');
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.raster.width).toBeLessThan(96);

    const blank = png(80, 80, (rgba) => {
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 240;
        rgba[i + 3] = 255;
      }
    });
    const missing = inspectSubject(blank, 'image/png');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toMatch(/Replace the image/i);

    const two = png(120, 80, (rgba) => {
      rgba.fill(255);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      for (const origin of [8, 80]) {
        for (let y = 20; y < 55; y += 1) {
          for (let x = origin; x < origin + 24; x += 1) {
            const o = (y * 120 + x) * 4;
            rgba[o] = 0;
            rgba[o + 1] = 0;
            rgba[o + 2] = 0;
          }
        }
      }
    });
    const ambiguous = inspectSubject(two, 'image/png');
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.code).toBe('subject_ambiguous');
  });
});

describe(`${FIXTURE} sprite grid`, () => {
  it('covers a 1254px sheet even though 1254 is not divisible by 4', () => {
    const edges = gridEdges(1254, 4);
    expect(edges[0]).toBe(0);
    expect(edges[edges.length - 1]).toBe(1254);
    const spans = edges.slice(1).map((edge, index) => edge - edges[index]);
    expect(spans.reduce((sum, span) => sum + span, 0)).toBe(1254);
    expect(spans.every((span) => span >= 313 && span <= 314)).toBe(true);
    const sheet = png(10, 10, (rgba) => {
      for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 255;
      rgba[0] = 255;
      rgba[(10 * 10 - 1) * 4 + 2] = 255;
    });
    const frames = sliceSheet(decodeRaster(sheet, 'image/png'));
    expect(frames).toHaveLength(16);
    expect(
      frames.reduce((sum, frame) => sum + frame.width * frame.height, 0)
    ).toBe(100);
    expect(frames[0].rgba[0]).toBe(255);
    const last = frames[15];
    expect(last.rgba[(last.width * last.height - 1) * 4 + 2]).toBe(255);
    expect(() =>
      sliceSheet(
        decodeRaster(
          png(5, 5, (rgba) => rgba.fill(255)),
          'image/png'
        )
      )
    ).toThrow(/too small|empty cell/);
  });
});

describe(`${FIXTURE} real GIF assembly`, () => {
  it('builds a looping 16-frame GIF and a theme-background GIF from a sprite sheet', async () => {
    const sheet = movingSheet();
    const transparent = await assembleStickerGif({
      sheetPng: sheet,
      caption: 'OK',
      language: 'en',
      background: 'transparent',
      themeColor: '#FFF4D8',
      motion: 'medium',
      outputSize: 48,
    });
    const reader = new GifReader(transparent);
    expect(reader.numFrames()).toBe(16);
    expect(reader.loopCount()).toBe(0);
    expect(reader.width).toBe(48);
    expect(reader.height).toBe(48);
    const first = new Uint8Array(48 * 48 * 4);
    const mid = new Uint8Array(48 * 48 * 4);
    reader.decodeAndBlitFrameRGBA(0, first);
    reader.decodeAndBlitFrameRGBA(8, mid);
    expect(first.some((value, index) => value !== mid[index])).toBe(true);
    expect(reader.frameInfo(0).transparent_index).toBeGreaterThanOrEqual(0);
    expect(first[3]).toBe(0);

    const themed = await assembleStickerGif({
      sheetPng: sheet,
      caption: '收到',
      language: 'zh',
      background: 'theme',
      themeColor: '#E7F6FF',
      motion: 'fast',
      outputSize: 48,
    });
    const themeReader = new GifReader(themed);
    const themeFrame = new Uint8Array(48 * 48 * 4);
    themeReader.decodeAndBlitFrameRGBA(0, themeFrame);
    expect(themeFrame[3]).toBe(255);
    expect(themeFrame[2]).toBeGreaterThan(200);
    const zip = zipStored([
      { name: '01-ok.gif', bytes: transparent },
      { name: '02-shou.gif', bytes: themed },
    ]);
    const files = unzipStored(zip);
    expect(files.map((file) => file.name)).toEqual([
      '01-ok.gif',
      '02-shou.gif',
    ]);
    expect(files[0].bytes[0]).toBe(0x47);
  });

  it('draws legible English and Chinese captions on a fixture frame', () => {
    const base = decodeRaster(
      png(64, 64, (rgba) => {
        for (let i = 0; i < rgba.length; i += 4) {
          rgba[i + 3] = 255;
        }
      }),
      'image/png'
    );
    const english = overlayCaption(base, 'OK', 'en');
    const chinese = overlayCaption(base, '收到', 'zh');
    const band = (raster: typeof base) => {
      let ink = 0;
      for (let y = 40; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const o = (y * 64 + x) * 4;
          if (raster.rgba[o] > 200 && raster.rgba[o + 3] === 255) ink += 1;
        }
      }
      return ink;
    };
    expect(band(english)).toBeGreaterThan(8);
    expect(band(chinese)).toBeGreaterThan(8);
    expect(
      english.rgba.some((value, index) => value !== chinese.rgba[index])
    ).toBe(true);
  });
});

describe('options reach the provider prompt', () => {
  it('includes style, motion, background, and leaves captions off the model prompt', () => {
    const anchor = anchorPrompt('pixel', 'transparent', '#FFF4D8');
    const sheet = sheetPrompt(
      'felt',
      'fast',
      'theme',
      '#E7F6FF',
      'hugs itself and sways'
    );
    expect(anchor).toContain('pixel');
    expect(anchor).toContain('#FF00FF');
    expect(sheet).toContain('felt');
    expect(sheet).toContain('quicker pose changes');
    expect(sheet).toContain('#E7F6FF');
    expect(sheet).toContain('hugs itself and sways');
    expect(sheet).not.toContain('收到');
    expect(anchor).toContain('No letters');
  });
});
