import { createFileRoute } from '@tanstack/react-router';

import { DAME_HOMBRO_PATH } from '@/lib/dame-hombro-path';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { DameHombroForm } from '@/blocks/dame-hombro-form';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { getBlogPostsFn } from '@/content/posts/server';

const UPDATED_AT = '2026-10-30';

export const Route = createFileRoute('/dame-hombro')({
  loader: async () => {
    const locale = getLocale();
    const posts = await getBlogPostsFn({ data: { locale } });
    return {
      locale,
      posts,
      title: m['dame_hombro.meta_title']({}, { locale }),
      description: m['dame_hombro.meta_description']({}, { locale }),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    return trendPageMeta({
      locale: loaderData.locale,
      title: loaderData.title,
      description: loaderData.description,
      path: DAME_HOMBRO_PATH,
      dateModified: UPDATED_AT,
    });
  },
  component: DameHombroPage,
});

function DameHombroPage() {
  const { posts } = Route.useLoaderData();
  return (
    <div className="trend-site flex min-h-screen flex-col">
      <Header
        brandMark="trend"
        nav="uptown"
        createHref={`${DAME_HOMBRO_PATH}#create`}
      />
      <main className="flex-1">
        <section className="trend-stage trend-hero">
          <div className="trend-container">
            <p className="trend-sticker">{m['dame_hombro.eyebrow']()}</p>
            <h1 className="trend-hero-title">{m['dame_hombro.title']()}</h1>
            <p className="trend-hero-description">
              {m['dame_hombro.description']()}
            </p>
            <DameHombroForm />
          </div>
        </section>
      </main>
      <Footer posts={posts} />
    </div>
  );
}
