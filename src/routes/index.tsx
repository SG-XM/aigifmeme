import { createFileRoute } from '@tanstack/react-router';

import { getGeneratedVideoCountFn } from '@/modules/social-proof/server';
import { homeDemoClips } from '@/lib/home-demos';
import { HOME_RELATED_SLUG, presentRelatedPosts } from '@/lib/related-posts';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { HomeLanding } from '@/blocks/home-landing';
import { getBlogPostsFn } from '@/content/posts/server';

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
      heroVideos: videos.hero.map((clip, index) => ({
        ...clip,
        title: homeClipTitle(index),
      })),
      galleryVideos: videos.gallery.map((clip, index) => ({
        ...clip,
        title: homeClipTitle(index),
      })),
      title: m['home.meta_title']({}, { locale }),
      description: m['home.meta_description']({}, { locale }),
      summary: m['home.summary']({}, { locale }),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const meta = trendPageMeta({ ...loaderData, path: '/' });
    return {
      ...meta,
      links: [
        ...(meta.links ?? []),
        {
          rel: 'preload',
          as: 'image',
          href: '/videos/showcase/home/werewolf-dance-poster.jpg',
          fetchPriority: 'high',
        },
      ],
    };
  },
  component: HomePage,
});

function homeClipTitle(index: number) {
  const titles = [
    m['home.clip_1'](),
    m['home.clip_2'](),
    m['home.clip_3'](),
    m['home.clip_4'](),
    m['home.clip_5'](),
    m['home.clip_6'](),
  ];
  return titles[index] ?? m['home.clip_fallback']();
}

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
    />
  );
}
