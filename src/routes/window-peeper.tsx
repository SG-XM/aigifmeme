import { createFileRoute } from '@tanstack/react-router';

import { getGeneratedVideoCountFn } from '@/modules/social-proof/server';
import { WINDOW_PEEPER_PATH } from '@/lib/ai-video-paths';
import { getEffectRelatedFn } from '@/lib/effect-related-server';
import { EFFECT_SLUG_BY_ID, presentRelatedPosts } from '@/lib/related-posts';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { windowPeeperSingleOfferLd } from '@/lib/window-peeper-offer';
import { WINDOW_PEEPER_UPDATED_AT } from '@/lib/window-peeper-reference';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { TrendLanding } from '@/blocks/trend-landing';
import { getBlogPostsFn } from '@/content/posts/server';

export const Route = createFileRoute('/window-peeper')({
  loader: async () => {
    const locale = getLocale();
    const [articles, generatedCount, siteName, related] = await Promise.all([
      getBlogPostsFn({ data: { locale, includeContent: true } }),
      getGeneratedVideoCountFn(),
      getSiteNameFn(),
      getEffectRelatedFn({ data: { slug: EFFECT_SLUG_BY_ID.peeper } }),
    ]);
    const description = m['trend.peeper.meta_description']({}, { locale });
    const priceHeading = m['effect.peeper.price_heading']({}, { locale });
    return {
      locale,
      siteName,
      posts: presentRelatedPosts(articles, {
        slug: EFFECT_SLUG_BY_ID.peeper,
        relatedPostTags: related.relatedPostTags,
        relatedPostIds: related.relatedPostIds,
      }),
      generatedCount,
      title: m['trend.peeper.meta_title']({}, { locale }),
      description,
      summary: description,
      priceHeading,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const meta = trendPageMeta({
      ...loaderData,
      path: WINDOW_PEEPER_PATH,
      dateModified: WINDOW_PEEPER_UPDATED_AT,
    });
    return {
      ...meta,
      scripts: [
        ...(meta.scripts ?? []),
        {
          type: 'application/ld+json',
          children: JSON.stringify(
            windowPeeperSingleOfferLd(
              loaderData.locale,
              loaderData.priceHeading
            )
          ).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
  component: WindowPeeperPage,
});

function WindowPeeperPage() {
  const { posts, generatedCount } = Route.useLoaderData();
  return (
    <TrendLanding
      trend="peeper"
      posts={posts}
      generatedCount={generatedCount}
      updatedAt={WINDOW_PEEPER_UPDATED_AT}
    />
  );
}
