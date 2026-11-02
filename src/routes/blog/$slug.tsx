import { createFileRoute, notFound } from '@tanstack/react-router';
import { ArrowLeft, Calendar } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { resolveSiteName } from '@/lib/site-name';
import { getSiteNameFn } from '@/lib/site-name-server';
import { m } from '@/paraglide/messages.js';
import { baseLocale, getLocale, localizeUrl } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { MarkdownContent } from '@/components/markdown-content';
import { formatPostDate } from '@/content/posts';
import { getBlogPostFn, getBlogPostsFn } from '@/content/posts/server';

const BLOG_CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

function schemaLanguage(locale: string) {
  if (locale === 'zh') return 'zh-CN';
  if (locale === 'es') return 'es';
  if (locale === 'ar') return 'ar';
  return 'en';
}

export const Route = createFileRoute('/blog/$slug')({
  headers: () => ({ 'Cache-Control': BLOG_CACHE_CONTROL }),
  loader: async ({ params }) => {
    const locale = getLocale();
    const post = await getBlogPostFn({
      data: { slug: params.slug, locale },
    });
    if (!post) throw notFound();
    const [posts, siteName] = await Promise.all([
      getBlogPostsFn({ data: { locale } }),
      getSiteNameFn(),
    ]);
    return { locale, post, posts, siteName };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { locale, post } = loaderData;
    const siteName = resolveSiteName(loaderData.siteName, envConfigs.app_name);
    const canonical = localizeUrl(`${envConfigs.app_url}/blog/${post.slug}`, {
      locale: locale as any,
    }).href;
    return {
      meta: [
        { title: `${post.title} | ${siteName}` },
        { name: 'description', content: post.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: post.title },
        { property: 'og:description', content: post.description },
        { property: 'og:url', content: canonical },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: post.title },
        { name: 'twitter:description', content: post.description },
      ],
      links: [
        { rel: 'canonical', href: canonical },
        ...post.localizedLocales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: localizeUrl(`${envConfigs.app_url}/blog/${post.slug}`, {
            locale: loc,
          }).href,
        })),
        {
          rel: 'alternate',
          hrefLang: 'x-default',
          href: localizeUrl(`${envConfigs.app_url}/blog/${post.slug}`, {
            locale: post.localizedLocales.includes(baseLocale)
              ? baseLocale
              : (post.localizedLocales[0] ?? baseLocale),
          }).href,
        },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            datePublished: post.createdAt,
            inLanguage: schemaLanguage(post.contentLocale),
            mainEntityOfPage: canonical,
            ...(post.image ? { image: post.image } : {}),
            ...(post.authorName
              ? { author: { '@type': 'Person', name: post.authorName } }
              : {}),
          }).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
  component: BlogPostPage,
});

function BlogPostPage() {
  const { locale, post, posts } = Route.useLoaderData();

  return (
    <div className="filemeta-site bg-background text-foreground flex min-h-screen flex-col">
      <Header brandMark="filemeta" />
      <main className="flex-1 px-6 py-12 md:px-8 md:py-16">
        <article className="filemeta-article mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="size-4" />
            {m['blog.back_to_blog']()}
          </Link>

          <header className="border-border mt-8 mb-6 border-b pb-6">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl">
              {post.title}
            </h1>
            {post.description && (
              <p className="text-muted-foreground mt-3">{post.description}</p>
            )}
            <div className="text-muted-foreground mt-4 flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4" />
                {formatPostDate(post.createdAt, locale)}
              </span>
              {(post.authorName || post.authorImage) && (
                <span className="inline-flex items-center gap-2">
                  {post.authorImage && (
                    <img
                      src={post.authorImage}
                      alt={post.authorName || ''}
                      width={20}
                      height={20}
                      className="size-5 rounded-full object-cover"
                    />
                  )}
                  {post.authorName}
                </span>
              )}
            </div>
          </header>

          {post.image && (
            <img
              src={post.image}
              alt={post.title}
              className="border-border mb-8 w-full rounded-lg border object-cover"
            />
          )}

          <MarkdownContent content={post.content || ''} />
        </article>
      </main>
      <Footer posts={posts} />
    </div>
  );
}
