import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HOME_HERO_DEMOS } from '@/lib/home-demos';

const ORIGINAL_PUBLIC_PATH = '/images/retention-offer-original.png';
const ORIGINAL_FILE = 'public/images/retention-offer-original.png';
/** SHA-256 of the committed portrait used as the retention Original still. */
const ORIGINAL_SHA256 =
  'bfb8396ac7a6aea93ae09074cafb569440d5b9ccc5639f32f4360ba96848211d';

describe('retention compare original still', () => {
  it('points the Original photo at the dedicated portrait', () => {
    const source = readFileSync('src/blocks/video-retention-offer.tsx', 'utf8');
    expect(source).toContain(
      `const RETENTION_IMAGE_URL = '${ORIGINAL_PUBLIC_PATH}';`
    );
    expect(source).not.toMatch(
      /RETENTION_IMAGE_URL\s*=\s*RETENTION_DEMO\.poster/
    );
    expect(source).toContain('image: RETENTION_IMAGE_URL');
    expect(source).toContain('const RETENTION_VIDEO_URL = RETENTION_DEMO.src;');
    expect(source).toContain(
      'const RETENTION_VIDEO_POSTER_URL = RETENTION_DEMO.poster ?? RETENTION_DEMO.src;'
    );

    const hero = HOME_HERO_DEMOS[0];
    expect(hero?.poster).toBe(
      '/videos/showcase/home/uptown-demo-ceo-hallelujah-v1.jpg'
    );
    expect(ORIGINAL_PUBLIC_PATH).not.toBe(hero?.poster);
    expect(ORIGINAL_PUBLIC_PATH).not.toBe(hero?.src);

    const bytes = readFileSync(ORIGINAL_FILE);
    expect(statSync(ORIGINAL_FILE).size).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      ORIGINAL_SHA256
    );
  });
});
