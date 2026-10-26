import { describe, expect, it } from 'vitest';

import { selectRelatedPosts } from '@/lib/related-posts';

import {
  WINDOW_PEEPER_GEO_TAG,
  WINDOW_PEEPER_GEO_TITLES,
  windowPeeperGeoPost,
  windowPeeperGeoPosts,
  windowPeeperGeoSitemapEntries,
} from './window-peeper-geo';

const TITLE = 'Window Peeper AI Pricing 2026: How Much for One 720p Video?';
const SLUG = 'window-peeper-ai-pricing-2026';
const COMPARE_TITLE =
  'Uptown vs WindowPeeperAI.com for Window Peeper (2026): Same $6.99 Single?';
const COMPARE_SLUG = 'window-peeper-ai-vs-windowpeeperai-2026';
const LOCALES = ['en', 'zh', 'es', 'ar'] as const;
const COMPARE_FAQ = {
  en: 'Is the Single price the same?',
  zh: 'Single 价格一样吗？',
  es: '¿El precio del Single es el mismo?',
  ar: 'هل سعر Single هو نفسه؟',
} as const;
const STALE_SINGLE = {
  en: 'That $9.90 price was not the public Single on either page that day.',
  zh: '当天两边公开页面上的 Single 都不是 $9.90。',
  es: 'Ese precio de $9.90 no era el Single público en ninguna de las dos páginas ese día.',
  ar: 'سعر $9.90 لم يكن سعر Single العام على أي من الصفحتين في ذلك اليوم.',
} as const;
const STILL_LISTED = {
  en: 'still showed that Single at $6.99 for 10 credits',
  zh: '公开 Single 仍是 $6.99 / 10 积分',
  es: 'seguía mostrando ese Single a $6.99 por 10 créditos',
  ar: 'وظلت حزمة Single العامة $6.99 مقابل 10 أرصدة',
} as const;
const LIVE_SOURCE = {
  en: 'use that live pricing page as the source of truth for the day you check',
  zh: '以当天那个公开价格页为准',
  es: 'usa esa página de precios en vivo como fuente para el día que revises',
  ar: 'فصفحة الأسعار العامة تلك هي المرجع لذلك اليوم',
} as const;

describe('window peeper pricing guide', () => {
  it('publishes English titles with the effect tag', () => {
    expect(WINDOW_PEEPER_GEO_TITLES).toEqual([TITLE, COMPARE_TITLE]);
    for (const locale of LOCALES) {
      const posts = windowPeeperGeoPosts(locale);
      expect(posts.map((post) => post.slug)).toEqual([SLUG, COMPARE_SLUG]);
      expect(posts.map((post) => post.title)).toEqual([TITLE, COMPARE_TITLE]);
      for (const post of posts) {
        expect(post.tags).toEqual([WINDOW_PEEPER_GEO_TAG]);
        expect(post.content).toBeUndefined();
      }
    }
  });

  it('answers the 2026-10-24 pack price and credit math in every locale', () => {
    for (const locale of LOCALES) {
      const post = windowPeeperGeoPost(SLUG, locale);
      expect(post?.title).toBe(TITLE);
      expect(post?.contentLocale).toBe(locale);
      expect(post?.localizedLocales).toEqual([...LOCALES]);
      const text = `${post?.description}\n${post?.content}`;
      expect(text).toContain('2026-10-24');
      expect(text).toContain('$6.99');
      expect(text).toContain('$16.99');
      expect(text).not.toContain('$9.99');
      expect(text).not.toContain('$29');
      expect(text).toContain('$9.90');
      expect(text).toContain('$99');
      expect(text).toContain('$199');
      expect(text).toContain('$499');
      expect(text).toContain('10');
      expect(text).toContain('13');
      expect(text).toContain('/window-peeper');
      expect(text).toContain('/pricing');
      expect(text).toContain('https://windowpeeperai.com/pricing');
      expect(text.match(/windowpeeperai\.com/g)).toHaveLength(1);
      expect(text.toLowerCase()).not.toMatch(
        /coming soon|cheapest|chatgpt|placeholder/
      );
    }
  });

  it('compares the 2026-10-24 Single price in every locale', () => {
    for (const locale of LOCALES) {
      const post = windowPeeperGeoPost(COMPARE_SLUG, locale);
      expect(post?.title).toBe(COMPARE_TITLE);
      expect(post?.contentLocale).toBe(locale);
      expect(post?.localizedLocales).toEqual([...LOCALES]);
      expect(post?.tags).toEqual([WINDOW_PEEPER_GEO_TAG]);
      const text = `${post?.description}\n${post?.content}`;
      expect(text).toContain('2026-10-24');
      expect(text).toContain('$6.99');
      expect(text).toContain('$16.99');
      expect(text).toContain('$99');
      expect(text).toContain('$199');
      expect(text).toContain('$499');
      expect(text).toContain('10');
      expect(text).toContain('13');
      expect(text).toContain('720p');
      expect(text).toContain('/window-peeper');
      expect(text).toContain('/pricing');
      expect(text).toContain(`/blog/${SLUG}`);
      expect(text).toContain(COMPARE_FAQ[locale]);
      expect(text).toContain('$9.90');
      expect(text).toContain(STALE_SINGLE[locale]);
      expect(text).toContain(STILL_LISTED[locale]);
      expect(text).toContain(LIVE_SOURCE[locale]);
      expect(text).toContain('https://windowpeeperai.com/pricing');
      expect(text.match(/windowpeeperai\.com/g)).toHaveLength(1);
      expect(text).not.toContain('$9.99');
      expect(text).not.toContain('$29');
      expect(text.toLowerCase()).not.toMatch(
        /coming soon|cheapest|chatgpt|placeholder|lorem|\btodo\b|\bbest\b/
      );
    }
  });

  it('stays on the window peeper guide list', () => {
    const posts = windowPeeperGeoPosts('en', { includeContent: true });
    expect(
      selectRelatedPosts(posts, { slug: 'window-peeper' }).map(
        (post) => post.slug
      )
    ).toEqual([SLUG, COMPARE_SLUG]);
    for (const slug of [
      'bulin-47',
      'burning-bridges',
      'im-so-sorry',
    ] as const) {
      expect(selectRelatedPosts(posts, { slug })).toEqual([]);
    }
  });

  it('lists the slug for the sitemap and ignores unknown slugs', () => {
    expect(windowPeeperGeoSitemapEntries()).toEqual([
      {
        slug: SLUG,
        createdAt: '2026-10-24T00:00:00.000Z',
        locales: [...LOCALES],
      },
      {
        slug: COMPARE_SLUG,
        createdAt: '2026-10-24T12:00:00.000Z',
        locales: [...LOCALES],
      },
    ]);
    expect(windowPeeperGeoPost('missing', 'en')).toBeNull();
  });
});
