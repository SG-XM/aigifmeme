import { createFileRoute } from '@tanstack/react-router';

import { getGeneratedVideoCountFn } from '@/modules/social-proof/server';
import { getEffectRelatedFn } from '@/lib/effect-related-server';
import { EFFECT_SLUG_BY_ID, presentRelatedPosts } from '@/lib/related-posts';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { TrendLanding } from '@/blocks/trend-landing';
import { getBlogPostsFn } from '@/content/posts/server';

export const Route = createFileRoute('/burning-bridges-ai')({
  loader: async () => {
    const locale = getLocale();
    const [articles, generatedCount, siteName, related] = await Promise.all([
      getBlogPostsFn({ data: { locale, includeContent: true } }),
      getGeneratedVideoCountFn(),
      getSiteNameFn(),
      getEffectRelatedFn({ data: { slug: EFFECT_SLUG_BY_ID.bridges } }),
    ]);
    return {
      locale,
      siteName,
      posts: presentRelatedPosts(articles, {
        slug: EFFECT_SLUG_BY_ID.bridges,
        relatedPostTags: related.relatedPostTags,
        relatedPostIds: related.relatedPostIds,
      }),
      generatedCount,
      title: m['trend.bridges.meta_title']({}, { locale }),
      description: m['trend.bridges.meta_description']({}, { locale }),
      summary: m['recast.bridges.summary']({}, { locale }),
    };
  },
  head: ({ loaderData }) =>
    loaderData
      ? trendPageMeta({ ...loaderData, path: '/burning-bridges-ai' })
      : {},
  component: BurningBridgesPage,
});

function BurningBridgesPage() {
  const { posts, generatedCount } = Route.useLoaderData();
  return (
    <TrendLanding
      trend="bridges"
      posts={posts}
      generatedCount={generatedCount}
    />
  );
}
