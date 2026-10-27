import { createServerFn } from '@tanstack/react-start';

import { isRetiredBlogSlug } from '@/lib/gone-paths';

import type { BlogLocale, BlogPost, BlogPostDetail } from './index';

function asBlogLocale(locale: string): BlogLocale {
  if (locale === 'zh' || locale === 'es' || locale === 'ar') return locale;
  return 'en';
}

function withoutRetired<T extends { slug: string }>(posts: T[]): T[] {
  return posts.filter((post) => !isRetiredBlogSlug(post.slug));
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
      return withoutRetired(rows).map((row) => ({
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
    } catch {
      // Retired code-published guides are not a fallback. An unreachable
      // database leaves the blog index empty instead of republishing them.
      return [];
    }
  });

export const getBlogPostFn = createServerFn()
  .inputValidator((data: { slug: string; locale: string }) => data)
  .handler(async ({ data }): Promise<BlogPostDetail | null> => {
    if (isRetiredBlogSlug(data.slug)) return null;
    try {
      const { findPublishedBySlug } = await import('@/modules/posts/service');
      const row = await findPublishedBySlug(
        data.slug,
        asBlogLocale(data.locale)
      );
      if (!row || isRetiredBlogSlug(row.slug)) return null;
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
      return null;
    }
  });
