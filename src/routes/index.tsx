import { lazy, Suspense, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';

import { getGeneratedVideoCountFn } from '@/modules/social-proof/server';
import { homeDemoClips } from '@/lib/home-demos';
import { HOME_RELATED_SLUG, presentRelatedPosts } from '@/lib/related-posts';
import { scheduleThirdParty } from '@/lib/schedule-third-party';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { HomeLanding } from '@/blocks/home-landing';
import { getBlogPostsFn } from '@/content/posts/server';

const EffectsAnnounce = lazy(() =>
  import('@/blocks/effects-announce').then((mod) => ({
    default: mod.EffectsAnnounce,
  }))
);

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
      posts: presentRelatedPosts(articles, { slug: HOME_RELATED_SLUG }),
      generatedCount,
      siteName,
      heroVideos: videos.hero,
      galleryVideos: videos.gallery,
      title: m['home.meta_title']({}, { locale }),
      description: m['home.meta_description']({}, { locale }),
      summary: m['recast.bulin.summary']({}, { locale }),
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
        {
          rel: 'preload',
          as: 'image',
          href: '/videos/showcase/window-peeper/announce-result.jpg',
        },
        {
          rel: 'preload',
          as: 'image',
          href: '/videos/showcase/burning-bridges/announce-man.jpg',
        },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { posts, heroVideos, galleryVideos, generatedCount } =
    Route.useLoaderData();
  // The first-visit dialog is not part of first paint. Load it on the same
  // idle/interact schedule as analytics so its chunk does not race the hero.
  const [showAnnounce, setShowAnnounce] = useState(false);
  useEffect(() => scheduleThirdParty(() => setShowAnnounce(true)), []);
  return (
    <>
      <HomeLanding
        posts={posts}
        heroVideos={heroVideos}
        galleryVideos={galleryVideos}
        generatedCount={generatedCount}
      />
      {showAnnounce ? (
        <Suspense fallback={null}>
          <EffectsAnnounce />
        </Suspense>
      ) : null}
    </>
  );
}
