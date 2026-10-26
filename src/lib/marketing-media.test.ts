import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SOLO_DEMO, WEREWOLF_OFFER_MEDIA } from '@/lib/bulin-reference';
import { TRIO_DEMO } from '@/lib/bulin-trio-reference';
import { BURNING_BRIDGES_SHOWCASE } from '@/lib/burning-bridges-reference';
import { HOME_HERO_DEMOS } from '@/lib/home-demos';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('marketing playback media', () => {
  it('points homepage, offer, and bridges demos at same-origin files', () => {
    const urls = [
      SOLO_DEMO.src,
      SOLO_DEMO.poster,
      TRIO_DEMO.src,
      TRIO_DEMO.poster,
      WEREWOLF_OFFER_MEDIA.src,
      WEREWOLF_OFFER_MEDIA.poster,
      WEREWOLF_OFFER_MEDIA.image,
      ...HOME_HERO_DEMOS.flatMap((clip) =>
        [clip.src, clip.poster].filter((url): url is string => Boolean(url))
      ),
      ...BURNING_BRIDGES_SHOWCASE,
    ];

    expect(new Set(urls).size).toBeGreaterThan(8);
    for (const url of urls) {
      expect(url.startsWith('/videos/'), url).toBe(true);
      expect(url, url).not.toMatch(/r2\.dev|airapduo\.io|https?:/);
      const file = resolve(ROOT, 'public', url.slice(1));
      expect(existsSync(file), url).toBe(true);
      expect(statSync(file).size, url).toBeGreaterThan(10_000);
    }
  });
});
