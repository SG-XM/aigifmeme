import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BULIN_ORIGINAL_VIDEO,
  BULIN_REFERENCE_VIDEOS,
} from '@/lib/bulin-reference';
import { TRIO_REFERENCE_VIDEOS } from '@/lib/bulin-trio-reference';
import { BURNING_BRIDGES_REFERENCE } from '@/lib/burning-bridges-reference';
import { PUBLIC_REFERENCE_MEDIA_BASE } from '@/lib/public-reference-media';
import {
  CREATE_REFERENCE_VIDEO_URL,
  CREATE_REFERENCE_VIDEO_URL_12S,
  CREATE_REFERENCE_VIDEO_URL_15S,
  probeReferenceVideoUrl,
  resolveCreateReferenceVideoUrl,
} from '@/lib/reference-video-config';
import { WINDOW_PEEPER_REFERENCE } from '@/lib/window-peeper-reference';

const BUILTIN_VIDEOS = [
  BULIN_ORIGINAL_VIDEO.url,
  BULIN_REFERENCE_VIDEOS.from7s15s.url,
  BULIN_REFERENCE_VIDEOS.from4s15s.url,
  TRIO_REFERENCE_VIDEOS.trio12.url,
  TRIO_REFERENCE_VIDEOS.trio15.url,
  WINDOW_PEEPER_REFERENCE.url,
];

function rangeResponse(
  status: number,
  contentType = 'video/mp4',
  finalUrl = 'https://cdn.example.com/clip.mp4'
) {
  return {
    status,
    url: finalUrl,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType : null,
    },
    body: { cancel: vi.fn(async () => undefined) },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('built-in reference videos', () => {
  it('stays on the public R2 host that answers HTTP Range', () => {
    expect(PUBLIC_REFERENCE_MEDIA_BASE).toBe(
      'https://media.uptownfunkai.video'
    );
    for (const url of BUILTIN_VIDEOS) {
      expect(url.startsWith(`${PUBLIC_REFERENCE_MEDIA_BASE}/reference/`)).toBe(
        true
      );
      expect(url.endsWith('.mp4')).toBe(true);
      expect(url).not.toContain('/videos/');
      expect(url).not.toContain('r2.dev');
    }
  });

  it('does not keep a downloadable Burning Bridges site path', () => {
    expect(BURNING_BRIDGES_REFERENCE).not.toHaveProperty('url');
    expect(BURNING_BRIDGES_REFERENCE.durationSeconds).toBe(15);
  });
});

describe('resolveCreateReferenceVideoUrl', () => {
  const fallback = TRIO_REFERENCE_VIDEOS.trio12.url;

  it('keeps the built-in clip when admin fields are empty', () => {
    expect(
      resolveCreateReferenceVideoUrl({
        configs: { [CREATE_REFERENCE_VIDEO_URL]: '  ' },
        referenceVideoVersion: 'trio12',
        fallbackUrl: fallback,
      })
    ).toBe(fallback);
  });

  it('prefers the 12-second field, then the default field, for crew jobs', () => {
    const specific = 'https://cdn.example.com/twelve.mp4';
    const shared = 'https://cdn.example.com/shared.mp4';
    expect(
      resolveCreateReferenceVideoUrl({
        configs: {
          [CREATE_REFERENCE_VIDEO_URL_12S]: specific,
          [CREATE_REFERENCE_VIDEO_URL]: shared,
        },
        referenceVideoVersion: 'trio12',
        fallbackUrl: fallback,
      })
    ).toBe(specific);
    expect(
      resolveCreateReferenceVideoUrl({
        configs: { [CREATE_REFERENCE_VIDEO_URL]: shared },
        referenceVideoVersion: 'trio12',
        fallbackUrl: fallback,
      })
    ).toBe(shared);
    expect(
      resolveCreateReferenceVideoUrl({
        configs: {
          [CREATE_REFERENCE_VIDEO_URL_15S]:
            'https://cdn.example.com/fifteen.mp4',
          [CREATE_REFERENCE_VIDEO_URL]: shared,
        },
        referenceVideoVersion: 'trio15',
        fallbackUrl: TRIO_REFERENCE_VIDEOS.trio15.url,
      })
    ).toBe('https://cdn.example.com/fifteen.mp4');
  });

  it('uses the default field for solo and leaves Window Peeper on its constant', () => {
    const shared = 'https://cdn.example.com/shared.mp4';
    expect(
      resolveCreateReferenceVideoUrl({
        configs: { [CREATE_REFERENCE_VIDEO_URL]: shared },
        referenceVideoVersion: 'from7s15s',
        fallbackUrl: BULIN_REFERENCE_VIDEOS.from7s15s.url,
      })
    ).toBe(shared);
    expect(
      resolveCreateReferenceVideoUrl({
        configs: {
          [CREATE_REFERENCE_VIDEO_URL]: shared,
          [CREATE_REFERENCE_VIDEO_URL_12S]:
            'https://cdn.example.com/twelve.mp4',
          [CREATE_REFERENCE_VIDEO_URL_15S]:
            'https://cdn.example.com/fifteen.mp4',
        },
        referenceVideoVersion: 'windowPeeper',
        fallbackUrl: WINDOW_PEEPER_REFERENCE.url,
      })
    ).toBe(WINDOW_PEEPER_REFERENCE.url);
  });
});

describe('probeReferenceVideoUrl', () => {
  it('rejects URLs the provider cannot download before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeReferenceVideoUrl('')).resolves.toBeUndefined();
    await expect(
      probeReferenceVideoUrl('http://cdn.example.com/a.mp4')
    ).rejects.toThrow(/https/);
    await expect(
      probeReferenceVideoUrl('https://cdn.example.com/a.mov')
    ).rejects.toThrow(/MP4/);
    await expect(
      probeReferenceVideoUrl('https://user:pass@cdn.example.com/a.mp4')
    ).rejects.toThrow(/credentials/);
    await expect(
      probeReferenceVideoUrl('https://127.0.0.1/a.mp4')
    ).rejects.toThrow(/publicly reachable/);
    await expect(
      probeReferenceVideoUrl('https://169.254.169.254/a.mp4')
    ).rejects.toThrow(/publicly reachable/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a public MP4 that answers Range with 206', async () => {
    const fetchMock = vi.fn(async () => rangeResponse(206));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      probeReferenceVideoUrl('https://cdn.example.com/clip.mp4')
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/clip.mp4',
      expect.objectContaining({
        headers: { Range: 'bytes=0-1' },
      })
    );
  });

  it('rejects redirects, a miss, and an HTML body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => rangeResponse(302))
    );
    await expect(
      probeReferenceVideoUrl('https://cdn.example.com/jump.mp4')
    ).rejects.toThrow(/redirect/);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => rangeResponse(404))
    );
    await expect(
      probeReferenceVideoUrl('https://cdn.example.com/missing.mp4')
    ).rejects.toThrow(/206/);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => rangeResponse(206, 'text/html'))
    );
    await expect(
      probeReferenceVideoUrl('https://cdn.example.com/page.mp4')
    ).rejects.toThrow(/video/);
  });
});
