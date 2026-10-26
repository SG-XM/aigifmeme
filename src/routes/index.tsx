import { createFileRoute } from '@tanstack/react-router';

import { getGeneratedVideoCountFn } from '@/modules/social-proof/server';
import { homeDemoClips } from '@/lib/home-demos';
import { HOME_RELATED_SLUG, presentRelatedPosts } from '@/lib/related-posts';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale, type Locale } from '@/paraglide/runtime.js';
import { HomeLanding } from '@/blocks/home-landing';
import { getBlogPostsFn } from '@/content/posts/server';

/** Homepage copy revision. Other trend pages keep TREND_PAGE_UPDATED_AT. */
const HOME_UPDATED_AT = '2026-10-26';

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function homeFaqLd(locale: Locale) {
  const copy = { locale };
  const pairs = [
    [m['home.faq_q1']({}, copy), m['home.faq_a1']({}, copy)],
    [m['home.faq_q2']({}, copy), m['home.faq_a2']({}, copy)],
    [m['home.faq_q3']({}, copy), m['home.faq_a3']({}, copy)],
    [m['home.faq_q4']({}, copy), m['home.faq_a4']({}, copy)],
    [m['home.faq_q5']({}, copy), m['home.faq_a5']({}, copy)],
    [m['home.faq_q6']({}, copy), m['home.faq_a6']({}, copy)],
    [m['home.faq_q7']({}, copy), m['home.faq_a7']({}, copy)],
  ];
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  });
}

function homeHowToLd(locale: Locale) {
  const copy = { locale };
  const steps = [
    [
      m['home.step_upload_title']({}, copy),
      m['home.step_upload_body']({}, copy),
    ],
    [
      m['home.step_generate_title']({}, copy),
      m['home.step_generate_body']({}, copy),
    ],
    [
      m['home.step_download_title']({}, copy),
      m['home.step_download_body']({}, copy),
    ],
  ];
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: m['home.steps_title']({}, copy),
    description: m['home.steps_description']({}, copy),
    step: steps.map(([name, text], index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name,
      text,
    })),
  });
}

export const Route = createFileRoute('/')({
  loader: async () => {
    const locale = getLocale();
    const videos = homeDemoClips(locale);
    const [articles, generatedCount, siteName] = await Promise.all([
      getBlogPostsFn({ data: { locale, includeContent: true } }),
      getGeneratedVideoCountFn(),
      getSiteNameFn(),
    ]);
    return {
      locale,
      posts: presentRelatedPosts(articles, { slug: HOME_RELATED_SLUG }).filter(
        (post) =>
          !/bulin|burning bridges|freestyle|dame hombro|recast|free\s*rap|window peeper|peeper|i['’]?m so sorry/i.test(
            `${post.title} ${post.description ?? ''}`
          )
      ),
      generatedCount,
      siteName,
      heroVideos: videos.hero,
      galleryVideos: videos.gallery,
      title: m['home.meta_title']({}, { locale }),
      description: m['home.meta_description']({}, { locale }),
      summary: m['home.summary']({}, { locale }),
      faqLd: homeFaqLd(locale),
      howToLd: homeHowToLd(locale),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const meta = trendPageMeta({
      ...loaderData,
      path: '/',
      dateModified: HOME_UPDATED_AT,
    });
    return {
      ...meta,
      scripts: [
        ...(meta.scripts ?? []),
        { type: 'application/ld+json', children: loaderData.faqLd },
        { type: 'application/ld+json', children: loaderData.howToLd },
      ],
      links: [
        ...(meta.links ?? []),
        {
          rel: 'preload',
          as: 'image',
          href:
            loaderData.heroVideos[0]?.poster ??
            '/videos/showcase/home/uptown-demo-ceo-hallelujah-v1.jpg',
          fetchPriority: 'high',
        },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { posts, heroVideos, galleryVideos, generatedCount } =
    Route.useLoaderData();
  return (
    <HomeLanding
      voice="uptown"
      posts={posts}
      heroVideos={heroVideos}
      galleryVideos={galleryVideos}
      generatedCount={generatedCount}
      updatedAt={HOME_UPDATED_AT}
    />
  );
}
