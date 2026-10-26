import type { EffectCampaign } from '@/lib/ai-video-paths';
import type { HomeDemoClip } from '@/lib/home-demos';
import { HomeLanding } from '@/blocks/home-landing';
import type { BlogPost } from '@/content/posts';

/** Effect pages share the homepage layout and the same generator. */
export function TrendLanding({
  trend,
  posts,
  heroVideos,
  galleryVideos,
  generatedCount = null,
  updatedAt,
}: {
  trend: EffectCampaign;
  posts?: BlogPost[];
  heroVideos?: HomeDemoClip[];
  galleryVideos?: HomeDemoClip[];
  generatedCount?: number | null;
  updatedAt?: string;
}) {
  return (
    <HomeLanding
      campaign={trend}
      posts={posts}
      heroVideos={heroVideos}
      galleryVideos={galleryVideos}
      generatedCount={generatedCount}
      updatedAt={updatedAt}
    />
  );
}
