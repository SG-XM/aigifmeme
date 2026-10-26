/**
 * Blog posts are stored in the database. These types and the date formatter
 * are safe to import from client components; loading happens in ./server.ts.
 */
export type BlogLocale = 'en' | 'zh' | 'es' | 'ar';

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image?: string;
  /** ISO date string — serializable across loader/server-fn boundaries */
  createdAt: string;
  authorName?: string;
  authorImage?: string;
  /** Normalized tag slugs. A matching tag is a bonus on effect pages. */
  tags: string[];
  /** Present only when a caller is matching keywords in the article body. */
  content?: string;
};

export type BlogPostDetail = BlogPost & {
  content: string;
  /** Locales with their own title and body. Empty translations are omitted. */
  localizedLocales: BlogLocale[];
  /** Locale whose title and body were used after the English fallback. */
  contentLocale: BlogLocale;
};

export function formatPostDate(dateIso: string, locale: string): string {
  const intlLocale =
    locale === 'zh'
      ? 'zh-CN'
      : locale === 'es'
        ? 'es'
        : locale === 'ar'
          ? 'ar'
          : 'en-US';
  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: locale === 'en' ? 'short' : 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateIso));
}
