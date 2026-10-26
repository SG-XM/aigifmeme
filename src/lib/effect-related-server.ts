import { createServerFn } from '@tanstack/react-start';

import {
  effectRelatedFromConfigs,
  isEffectBrandSlug,
  type EffectRelatedSettings,
} from '@/lib/related-posts';

function emptySettings(slug: string): EffectRelatedSettings | null {
  if (!isEffectBrandSlug(slug)) return null;
  return {
    slug,
    relatedPostTags: [],
    relatedPostIds: [],
  };
}

/** Admin-stored related tags and ids. Tags are a bonus match. */
export const getEffectRelatedFn = createServerFn()
  .inputValidator((data: { slug: string }) => {
    if (
      !data ||
      typeof data.slug !== 'string' ||
      !isEffectBrandSlug(data.slug)
    ) {
      throw new Error('Invalid effect');
    }
    return { slug: data.slug };
  })
  .handler(async ({ data }): Promise<EffectRelatedSettings> => {
    const fallback = emptySettings(data.slug);
    if (!fallback) throw new Error('Invalid effect');
    try {
      const { getDbConfigs } = await import('@/modules/config/service');
      const configs = await getDbConfigs();
      return effectRelatedFromConfigs(data.slug, configs);
    } catch (error) {
      console.error('effect related config unavailable', error);
      return fallback;
    }
  });
