import { createFileRoute } from '@tanstack/react-router';

import { getGeneratedVideoCountFn } from '@/modules/social-proof/server';
import { getEffectRelatedFn } from '@/lib/effect-related-server';
import { homeDemoClips } from '@/lib/home-demos';
import { EFFECT_SLUG_BY_ID, presentRelatedPosts } from '@/lib/related-posts';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { TrendLanding } from '@/blocks/trend-landing';
import { getBlogPostsFn } from '@/content/posts/server';

// Preserve previously shared blog links; the homepage is the canonical page.
export const Route = createFileRoute('/bulin-47-ai')({
  loader: async () => {
    const locale = getLocale();
    const videos = homeDemoClips(locale);
    const [articles, generatedCount, siteName, related] = await Promise.all([
      getBlogPostsFn({ data: { locale, includeContent: true } }),
      getGeneratedVideoCountFn(),
      getSiteNameFn(),
      getEffectRelatedFn({ data: { slug: EFFECT_SLUG_BY_ID.bulin } }),
    ]);
    return {
      locale,
      posts: presentRelatedPosts(articles, {
        slug: EFFECT_SLUG_BY_ID.bulin,
        relatedPostTags: related.relatedPostTags,
        relatedPostIds: related.relatedPostIds,
      }),
      generatedCount,
      siteName,
      heroVideos: videos.hero,
      galleryVideos: videos.gallery,
      title: m['trend.bulin.meta_title']({}, { locale }),
      description: m['trend.bulin.meta_description']({}, { locale }),
      summary: m['recast.bulin.summary']({}, { locale }),
    };
  },
  head: ({ loaderData }) =>
    loaderData ? trendPageMeta({ ...loaderData, path: '/' }) : {},
  component: BulinAliasPage,
});

function BulinAliasPage() {
  const { posts, heroVideos, galleryVideos, generatedCount } =
    Route.useLoaderData();
  return (
    <TrendLanding
      trend="bulin"
      posts={posts}
      heroVideos={heroVideos}
      galleryVideos={galleryVideos}
      generatedCount={generatedCount}
    />
  );
}
