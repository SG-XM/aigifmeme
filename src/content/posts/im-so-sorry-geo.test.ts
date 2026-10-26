import { describe, expect, it } from 'vitest';

import {
  IM_SO_SORRY_GEO_TAG,
  IM_SO_SORRY_GEO_TITLES,
  imSoSorryGeoPost,
  imSoSorryGeoPosts,
} from './im-so-sorry-geo';

const TITLES = [
  "I'm So Sorry Photo Trend: How the Lie Carousel Works",
  "I'm So Sorry Filter TikTok: Make the Slides From One Photo",
  "I'm So Sorry Photo Trend Download: Get Your Own 5-Slide Set",
] as const;

describe("i'm so sorry photo trend guides", () => {
  it('publishes the three locked titles with the effect tag', () => {
    expect(IM_SO_SORRY_GEO_TITLES).toEqual([...TITLES]);
    const posts = imSoSorryGeoPosts('en');
    expect(posts.map((post) => post.title)).toEqual([...TITLES]);
    expect(posts.every((post) => post.tags.includes(IM_SO_SORRY_GEO_TAG))).toBe(
      true
    );
  });

  it('answers carousel, how to make, and download without other effect brands', () => {
    const trend = imSoSorryGeoPost('im-so-sorry-photo-trend', 'en');
    const filter = imSoSorryGeoPost('im-so-sorry-filter-tiktok', 'en');
    const download = imSoSorryGeoPost('im-so-sorry-photo-trend-download', 'zh');
    expect(trend?.content).toContain("It's a photo carousel, not a video.");
    expect(filter?.content).toContain('/im-so-sorry');
    expect(filter?.content).toContain("i'm so sorry");
    expect(download?.content).toContain('5');
    expect(download?.content).toContain('/im-so-sorry');
    expect(download?.contentLocale).toBe('zh');
    for (const post of [trend, filter, download]) {
      const text = `${post?.title}\n${post?.content}`;
      expect(text).not.toMatch(/bulin-47|burning-bridges|window-peeper/i);
      expect(text.toLowerCase()).not.toContain("i'm so sorry ai");
    }
  });
});
