import { createFileRoute } from '@tanstack/react-router';

import { getEffectRelatedFn } from '@/lib/effect-related-server';
import {
  planSorrySet,
  SORRY_CREDIT_COST,
  SORRY_PAGE_UPDATED_AT,
} from '@/lib/im-so-sorry';
import { sorryDemoSources } from '@/lib/im-so-sorry-demos';
import { EFFECT_SLUG_BY_ID, presentRelatedPosts } from '@/lib/related-posts';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { SorryDemoCarousel } from '@/blocks/im-so-sorry-demos';
import { ImSoSorryForm } from '@/blocks/im-so-sorry-form';
import { Pricing } from '@/blocks/pricing';
import { TrendGuides } from '@/components/trend-guides';
import { imSoSorryGeoPosts } from '@/content/posts/im-so-sorry-geo';
import { getBlogPostsFn } from '@/content/posts/server';

export const Route = createFileRoute('/im-so-sorry')({
  validateSearch: (search) => ({
    task:
      typeof search.task === 'string' &&
      search.task.length > 0 &&
      search.task.length < 80
        ? search.task
        : undefined,
  }),
  loader: async () => {
    const locale = getLocale();
    const slug = EFFECT_SLUG_BY_ID.sorry;
    const [posts, siteName, related] = await Promise.all([
      getBlogPostsFn({ data: { locale, includeContent: true } }).catch(() =>
        imSoSorryGeoPosts(locale, { includeContent: true })
      ),
      getSiteNameFn(),
      getEffectRelatedFn({ data: { slug } }),
    ]);
    const relatedPosts = presentRelatedPosts(posts, {
      slug,
      relatedPostTags: related.relatedPostTags,
      relatedPostIds: related.relatedPostIds,
    });
    return {
      locale,
      siteName,
      relatedPosts,
      demoSources: sorryDemoSources(),
      title: m['sorry.meta_title']({}, { locale }),
      description: m['sorry.meta_description']({}, { locale }),
      summary: m['sorry.definition']({}, { locale }),
    };
  },
  head: ({ loaderData }) =>
    loaderData
      ? trendPageMeta({
          ...loaderData,
          path: '/im-so-sorry',
          dateModified: SORRY_PAGE_UPDATED_AT,
        })
      : {},
  component: ImSoSorryPage,
});

function ImSoSorryPage() {
  const { relatedPosts, demoSources } = Route.useLoaderData();
  const { task } = Route.useSearch();
  const locale = getLocale();
  const example = planSorrySet({
    styleId: 'halloween',
    lieIds: ['wig', 'costume', 'party', 'makeup'],
    locale,
  });
  const captions = [...example.captions, example.closing];
  const questions = [
    { question: m['sorry.faq_q1'](), answer: m['sorry.faq_a1']() },
    { question: m['sorry.faq_q2'](), answer: m['sorry.faq_a2']() },
    { question: m['sorry.faq_q3'](), answer: m['sorry.faq_a3']() },
    { question: m['sorry.faq_q4'](), answer: m['sorry.faq_a4']() },
  ];
  return (
    <div className="trend-site min-h-screen">
      <Header brandMark="trend" />
      <main>
        <section className="trend-stage trend-hero">
          <div className="trend-container">
            <p className="trend-sticker">{m['sorry.eyebrow']()}</p>
            <h1 className="trend-hero-title">{m['sorry.title']()}</h1>
            <p className="trend-hero-description">{m['sorry.description']()}</p>
            <div id="create" className="trend-generator">
              <ImSoSorryForm initialTaskId={task} />
            </div>
          </div>
        </section>
        <section id="examples" className="trend-section trend-showcase">
          <div className="trend-container">
            <h2 className="trend-section-heading">
              {m['sorry.demos_title']()}
            </h2>
            <p className="trend-hero-description">{m['sorry.demos_note']()}</p>
            <div className="mt-6">
              <SorryDemoCarousel sources={demoSources} captions={captions} />
            </div>
          </div>
        </section>
        <section className="sorry-cost" aria-labelledby="sorry-cost-heading">
          <div className="trend-container">
            <div className="sorry-cost-card">
              <p className="sorry-cost-mark" aria-hidden="true">
                {SORRY_CREDIT_COST}
              </p>
              <div className="sorry-cost-copy">
                <h2 id="sorry-cost-heading">{m['sorry.cost_title']()}</h2>
                <p>{m['sorry.cost_body']()}</p>
              </div>
            </div>
          </div>
        </section>
        <section id="pricing" className="trend-section">
          <div className="trend-container">
            <h2 className="trend-section-heading">
              {m['sorry.packs_title']()}
            </h2>
            <p className="trend-hero-description">{m['sorry.packs_body']()}</p>
            <div className="mt-6">
              <Pricing
                catalog="packs"
                tone="cinematic"
                placement="sorry-packs"
                redirect="/im-so-sorry"
              />
            </div>
          </div>
        </section>
        <section id="faq" className="trend-section">
          <div className="trend-container">
            <h2 className="trend-section-heading">{m['sorry.faq_title']()}</h2>
            <div className="trend-faq-list mt-6">
              {questions.map((item, index) => (
                <details
                  className="trend-faq"
                  key={item.question}
                  open={index === 0 ? true : undefined}
                >
                  <summary>
                    <span>{item.question}</span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <TrendGuides
          posts={relatedPosts}
          locale={locale}
          eyebrow={m['sorry.related_eyebrow']()}
          title={m['sorry.related_title']()}
          description={m['sorry.related_description']()}
          readLabel={m['sorry.related_read']()}
          viewAllLabel={m['landing.blog.view_all']()}
        />
      </main>
      <Footer posts={relatedPosts} />
    </div>
  );
}
