import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { AI_VIDEO_INDEX_PATH } from '@/lib/ai-video-paths';
import { liveEffectNav } from '@/lib/live-effect-nav';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { WINDOW_PEEPER_UPDATED_AT } from '@/lib/window-peeper-reference';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { getBlogPostsFn } from '@/content/posts/server';

export const Route = createFileRoute('/ai-video/')({
  loader: async () => {
    const locale = getLocale();
    const [posts, siteName] = await Promise.all([
      getBlogPostsFn({ data: { locale } }),
      getSiteNameFn(),
    ]);
    return {
      locale,
      siteName,
      posts,
      title: m['ai_video.meta_title']({}, { locale }),
      description: m['ai_video.meta_description']({}, { locale }),
      summary: m['ai_video.lead']({}, { locale }),
    };
  },
  head: ({ loaderData }) =>
    loaderData
      ? trendPageMeta({
          ...loaderData,
          path: AI_VIDEO_INDEX_PATH,
          dateModified: WINDOW_PEEPER_UPDATED_AT,
        })
      : {},
  component: AiVideoIndexPage,
});

function AiVideoIndexPage() {
  const { posts } = Route.useLoaderData();
  const scenes = liveEffectNav().map((effect) => ({
    href: effect.createHref,
    title: effect.title,
    body:
      effect.id === 'bridges'
        ? m['ai_video.bridges_body']()
        : effect.id === 'peeper'
          ? m['ai_video.peeper_body']()
          : effect.id === 'sorry'
            ? m['ai_video.sorry_body']()
            : m['ai_video.bulin_body'](),
  }));
  return (
    <div className="trend-site min-h-screen">
      <Header brandMark="trend" />
      <main>
        <section className="trend-stage trend-hero">
          <div className="trend-container">
            <p className="trend-sticker">{m['ai_video.kicker']()}</p>
            <h1 className="trend-hero-title">{m['ai_video.title']()}</h1>
            <p className="trend-hero-description">{m['ai_video.lead']()}</p>
            <div className="trend-next-grid trend-next-grid--three mt-10">
              {scenes.map((scene) => (
                <Link
                  key={scene.href}
                  href={scene.href}
                  className="trend-guide-card"
                >
                  <h3>{scene.title}</h3>
                  <p>{scene.body}</p>
                  <span>
                    {m['ai_video.open_scene']()}{' '}
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="trend-cta-actions mt-8">
              <Link
                href="/#create"
                className="trend-button trend-button-primary"
              >
                {m['ai_video.start']()}
              </Link>
              <Link
                href="/chat"
                className="trend-button trend-button-secondary"
              >
                {m['ai_video.chat']()}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer posts={posts} />
    </div>
  );
}
