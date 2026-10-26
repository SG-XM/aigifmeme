import { createServerFn } from '@tanstack/react-start';

import { imSoSorryGeoPost, imSoSorryGeoPosts } from './im-so-sorry-geo';
import type { BlogLocale, BlogPost, BlogPostDetail } from './index';
import { windowPeeperGeoPost, windowPeeperGeoPosts } from './window-peeper-geo';

function codeGeoPosts(locale: string, includeContent = false): BlogPost[] {
  return [
    ...imSoSorryGeoPosts(locale, { includeContent }),
    ...windowPeeperGeoPosts(locale, { includeContent }),
  ];
}

function codeGeoPost(slug: string, locale: string): BlogPostDetail | null {
  return imSoSorryGeoPost(slug, locale) ?? windowPeeperGeoPost(slug, locale);
}

function mergeGeoPosts(
  posts: BlogPost[],
  locale: string,
  includeContent = false
): BlogPost[] {
  const seen = new Set(posts.map((post) => post.slug));
  const extras = codeGeoPosts(locale, includeContent).filter(
    (post) => !seen.has(post.slug)
  );
  return [...posts, ...extras].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

function asBlogLocale(locale: string): BlogLocale {
  if (locale === 'zh' || locale === 'es' || locale === 'ar') return locale;
  return 'en';
}

export const getBlogPostsFn = createServerFn()
  .inputValidator(
    (data: { locale: string; limit?: number; includeContent?: boolean }) => data
  )
  .handler(async ({ data }): Promise<BlogPost[]> => {
    const includeContent = data.includeContent === true;
    try {
      const { listPublishedArticles } = await import('@/modules/posts/service');
      const rows = await listPublishedArticles({
        limit: data.limit ?? null,
        locale: asBlogLocale(data.locale),
        includeContent,
      });
      const mapped = rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        image: row.image,
        createdAt: new Date(row.createdAt).toISOString(),
        authorName: row.authorName,
        authorImage: row.authorImage,
        tags: row.tags,
        ...(row.content != null ? { content: row.content } : {}),
      }));
      return mergeGeoPosts(mapped, data.locale, includeContent);
    } catch {
      return mergeGeoPosts([], data.locale, includeContent);
    }
  });

export const getBlogPostFn = createServerFn()
  .inputValidator((data: { slug: string; locale: string }) => data)
  .handler(async ({ data }): Promise<BlogPostDetail | null> => {
    try {
      const { findPublishedBySlug } = await import('@/modules/posts/service');
      const row = await findPublishedBySlug(
        data.slug,
        asBlogLocale(data.locale)
      );
      if (!row) return codeGeoPost(data.slug, data.locale);
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        image: row.image,
        createdAt: new Date(row.createdAt).toISOString(),
        authorName: row.authorName,
        authorImage: row.authorImage,
        tags: row.tags,
        content: row.content,
        localizedLocales: row.locales,
        contentLocale: row.contentLocale,
      };
    } catch {
      return codeGeoPost(data.slug, data.locale);
    }
  });
