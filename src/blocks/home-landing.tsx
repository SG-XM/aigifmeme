import {
  ArrowRight,
  Coins,
  Download,
  ImagePlus,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { type EffectCampaign } from '@/lib/ai-video-paths';
import { BURNING_BRIDGES_SHOWCASE } from '@/lib/burning-bridges-reference';
import type { HomeDemoClip } from '@/lib/home-demos';
import { liveEffectNav } from '@/lib/live-effect-nav';
import { TREND_PAGE_UPDATED_AT } from '@/lib/trend-page-meta';
import {
  WINDOW_PEEPER_CASE,
  WINDOW_PEEPER_DEMOS,
  WINDOW_PEEPER_TREND_SOURCE,
} from '@/lib/window-peeper-reference';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { CreateVideo } from '@/blocks/create-video';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { Pricing } from '@/blocks/pricing';
import { SupportWidget } from '@/blocks/support-widget';
import { AgentHeaderProvider } from '@/components/agent/agent-header-context';
import { ScrollReveal } from '@/components/scroll-reveal';
import { TrendGuides } from '@/components/trend-guides';
import { ViewportVideo } from '@/components/viewport-video';
import { WindowPeeperCase } from '@/components/window-peeper-case';
import { formatPostDate, type BlogPost } from '@/content/posts';

function PeeperCompareLink() {
  return (
    <Link
      href="/blog/window-peeper-ai-vs-windowpeeperai-2026"
      className="trend-source"
    >
      {m['effect.peeper.price_compare_link']()}
    </Link>
  );
}

function PeeperPriceCite({ compare = false }: { compare?: boolean }) {
  return (
    <>
      {m['effect.peeper.price_note']()}{' '}
      <Link href="/pricing" className="trend-source">
        {m['landing.nav.pricing']()}
      </Link>
      {' · '}
      <Link href="/blog/window-peeper-ai-pricing-2026" className="trend-source">
        {m['effect.peeper.price_guide_link']()}
      </Link>
      {compare ? (
        <>
          {' · '}
          <PeeperCompareLink />
        </>
      ) : null}
    </>
  );
}

type LandingClip = {
  id?: string;
  src: string;
  poster?: string;
  title: string;
  cite?: string;
};

const LEGACY_TREND_COPY =
  /bulin|burning bridges|freestyle|dame hombro|recast|free\s*rap|window peeper|peeper|i['’]?m so sorry/i;

export function HomeLanding({
  campaign = 'bulin',
  voice,
  posts = [],
  heroVideos = [],
  galleryVideos = [],
  generatedCount = null,
  updatedAt = TREND_PAGE_UPDATED_AT,
}: {
  campaign?: EffectCampaign;
  /** Public homepage voice. Effect pages leave this unset. */
  voice?: 'uptown';
  /** Guides already matched for this page. Home is not filtered as an effect. */
  posts?: BlogPost[];
  heroVideos?: HomeDemoClip[];
  galleryVideos?: HomeDemoClip[];
  generatedCount?: number | null;
  updatedAt?: string;
} = {}) {
  const bridges = campaign === 'bridges';
  const uptown = voice === 'uptown';
  const relatedPosts = uptown
    ? posts.filter(
        (post) =>
          !LEGACY_TREND_COPY.test(`${post.title} ${post.description ?? ''}`)
      )
    : posts;
  const peeper = campaign === 'peeper';
  const locale = getLocale();
  const effectContent = peeper
    ? {
        title: m['effect.peeper.title'](),
        description: m['effect.peeper.description'](),
        eyebrow: m['effect.peeper.eyebrow'](),
        definitionTitle: m['effect.peeper.definition_title'](),
        summary: m['recast.peeper.summary'](),
        definition: m['effect.peeper.definition'](),
        origin: m['effect.peeper.origin'](),
        scene: m['effect.peeper.scene'](),
        photoHint: m['effect.peeper.photo_hint'](),
        faqSourceQuestion: m['effect.peeper.faq_source_q'](),
        faqSourceAnswer: m['effect.peeper.faq_source_a'](),
        previewTitle: m['recast.peeper.preview_title'](),
        previewReference: m['effect.peeper.clip_example'](),
        factSourceTitle: m['recast.peeper.fact_source_title'](),
        stepsDescription: m['recast.peeper.steps_description'](),
        featuresTitle: m['recast.peeper.features_title'](),
        featureSourceTitle: m['recast.peeper.feature_source_title'](),
        featureSourceBody: m['recast.peeper.feature_source_body'](),
        motionTitle: m['recast.peeper.tip_motion_title'](),
        motionBody: m['recast.peeper.tip_motion_body'](),
        ctaTitle: m['recast.peeper.cta_title'](),
        ctaDescription: m['recast.peeper.cta_description'](),
        source: WINDOW_PEEPER_TREND_SOURCE,
      }
    : bridges
      ? {
          title: m['effect.bridges.title'](),
          description: m['effect.bridges.description'](),
          eyebrow: m['effect.bridges.eyebrow'](),
          definitionTitle: m['effect.bridges.definition_title'](),
          summary: m['recast.bridges.summary'](),
          definition: m['effect.bridges.definition'](),
          origin: m['effect.bridges.origin'](),
          scene: m['effect.bridges.scene'](),
          photoHint: m['effect.bridges.photo_hint'](),
          faqSourceQuestion: m['effect.bridges.faq_source_q'](),
          faqSourceAnswer: m['effect.bridges.faq_source_a'](),
          previewTitle: m['recast.bridges.preview_title'](),
          previewReference: m['recast.bridges.preview_reference'](),
          factSourceTitle: m['recast.bridges.fact_source_title'](),
          stepsDescription: m['recast.bridges.steps_description'](),
          featuresTitle: m['recast.bridges.features_title'](),
          featureSourceTitle: m['recast.bridges.feature_source_title'](),
          featureSourceBody: m['recast.bridges.feature_source_body'](),
          motionTitle: m['recast.bridges.tip_motion_title'](),
          motionBody: m['recast.bridges.tip_motion_body'](),
          ctaTitle: m['recast.bridges.cta_title'](),
          ctaDescription: m['recast.bridges.cta_description'](),
          source: 'https://www.youtube.com/watch?v=bpD-JVy2zV4',
        }
      : {
          title: m['effect.bulin.title'](),
          description: m['effect.bulin.description'](),
          eyebrow: m['effect.bulin.eyebrow'](),
          definitionTitle: m['effect.bulin.definition_title'](),
          summary: m['recast.bulin.summary'](),
          definition: m['effect.bulin.definition'](),
          origin: m['effect.bulin.origin'](),
          scene: m['effect.bulin.scene'](),
          photoHint: m['effect.bulin.photo_hint'](),
          faqSourceQuestion: m['effect.bulin.faq_source_q'](),
          faqSourceAnswer: m['effect.bulin.faq_source_a'](),
          previewTitle: m['recast.bulin.preview_title'](),
          previewReference: m['recast.bulin.preview_reference'](),
          factSourceTitle: m['recast.bulin.fact_source_title'](),
          stepsDescription: m['recast.bulin.steps_description'](),
          featuresTitle: m['recast.bulin.features_title'](),
          featureSourceTitle: m['recast.bulin.feature_source_title'](),
          featureSourceBody: m['recast.bulin.feature_source_body'](),
          motionTitle: m['recast.bulin.tip_motion_title'](),
          motionBody: m['recast.bulin.tip_motion_body'](),
          ctaTitle: m['recast.bulin.cta_title'](),
          ctaDescription: m['recast.bulin.cta_description'](),
          source:
            'https://deultimominuto.com/entretenimiento/video-de-freestyle-de-bulin-47/',
        };
  const content = uptown
    ? {
        title: m['home.title'](),
        description: m['home.description'](),
        eyebrow: m['home.eyebrow'](),
        definitionTitle: m['home.definition_title'](),
        summary: m['home.summary'](),
        definition: m['home.definition'](),
        origin: m['home.about'](),
        scene: m['home.generator.scene'](),
        photoHint: m['home.generator.photo_hint'](),
        faqSourceQuestion: m['home.faq_q5'](),
        faqSourceAnswer: m['home.faq_a5'](),
        previewTitle: m['home.title'](),
        previewReference: m['home.clip_1'](),
        factSourceTitle: m['home.stat_crew_title'](),
        stepsDescription: m['home.steps_description'](),
        featuresTitle: m['home.features_title'](),
        featureSourceTitle: m['home.feature_photo_title'](),
        featureSourceBody: m['home.feature_photo_body'](),
        motionTitle: m['home.tip_review_title'](),
        motionBody: m['home.tip_review_body'](),
        ctaTitle: m['home.cta_title'](),
        ctaDescription: m['home.cta_description'](),
        source: '',
      }
    : effectContent;
  // Bridges keeps these clips. The default homepage receives HOME_HERO_DEMOS.
  const bridgesDemos: LandingClip[] = [
    {
      src: BURNING_BRIDGES_SHOWCASE[0],
      title: m['trend.sample_bridges_1'](),
      poster: undefined,
    },
    {
      src: BURNING_BRIDGES_SHOWCASE[1],
      title: m['trend.sample_bridges_2'](),
      poster: undefined,
    },
    {
      src: BURNING_BRIDGES_SHOWCASE[2],
      title: m['trend.sample_bridges_3'](),
      poster: undefined,
    },
  ];
  const peeperClips: LandingClip[] = peeper
    ? WINDOW_PEEPER_DEMOS.map((demo) => ({
        id: demo.id,
        src: demo.src,
        poster: 'poster' in demo ? demo.poster : undefined,
        title: m['effect.peeper.clip_example'](),
      }))
    : [];
  const heroClips: LandingClip[] = peeper
    ? peeperClips
    : bridges
      ? bridgesDemos.slice(0, 2)
      : heroVideos;
  const galleryClips: LandingClip[] = peeper
    ? peeperClips
    : bridges
      ? bridgesDemos
      : galleryVideos;
  const shownHero = heroClips;
  const facts = uptown
    ? [
        {
          title: m['home.stat_photo_title'](),
          body: m['home.stat_photo_body'](),
        },
        {
          title: m['home.stat_length_title'](),
          body: m['home.stat_length_body'](),
        },
        {
          title: m['home.stat_refund_title'](),
          body: m['home.stat_refund_body'](),
        },
        {
          title: m['home.stat_crew_title'](),
          body: m['home.stat_crew_body'](),
        },
      ]
    : [
        { title: m['recast.fact_photo_title'](), body: content.photoHint },
        { title: content.factSourceTitle, body: content.scene },
        {
          title: m['recast.fact_download_title'](),
          body: m['recast.fact_download_body'](),
        },
        {
          title: m['recast.fact_cost_title'](),
          body: m['recast.fact_cost_body'](),
        },
      ];
  const steps = uptown
    ? [
        {
          title: m['home.step_upload_title'](),
          body: m['home.step_upload_body'](),
        },
        {
          title: m['home.step_generate_title'](),
          body: m['home.step_generate_body'](),
        },
        {
          title: m['home.step_download_title'](),
          body: m['home.step_download_body'](),
        },
      ]
    : [
        { title: m['effect.upload_title'](), body: content.photoHint },
        {
          title: peeper
            ? m['effect.peeper.generate_title']()
            : bridges
              ? m['effect.generate_title']()
              : m['trend.bulin.generator_title'](),
          body: peeper
            ? m['effect.peeper.generate_body']()
            : bridges
              ? m['effect.generate_body']()
              : m['trend.bulin.generator_description'](),
        },
        {
          title: m['effect.download_title'](),
          body: m['effect.download_body'](),
        },
      ];
  const features = uptown
    ? [
        {
          icon: ImagePlus,
          title: m['home.feature_photo_title'](),
          body: m['home.feature_photo_body'](),
        },
        {
          icon: Coins,
          title: m['home.feature_credits_title'](),
          body: m['home.feature_credits_body'](),
        },
        {
          icon: SlidersHorizontal,
          title: m['home.feature_clothes_title'](),
          body: m['home.feature_clothes_body'](),
        },
        {
          icon: RotateCcw,
          title: m['home.feature_refund_title'](),
          body: m['home.feature_refund_body'](),
        },
        {
          icon: Download,
          title: m['home.feature_crew_title'](),
          body: m['home.feature_crew_body'](),
        },
        {
          icon: Smartphone,
          title: m['home.feature_browser_title'](),
          body: m['home.feature_browser_body'](),
        },
      ]
    : [
        {
          icon: ImagePlus,
          title: content.featureSourceTitle,
          body: content.featureSourceBody,
        },
        {
          icon: Coins,
          title: m['recast.feature_cost_title'](),
          body: m['recast.feature_cost_body'](),
        },
        {
          icon: SlidersHorizontal,
          title: m['recast.feature_quality_title'](),
          body: m['recast.feature_quality_body'](),
        },
        {
          icon: RotateCcw,
          title: m['recast.feature_refund_title'](),
          body: m['recast.feature_refund_body'](),
        },
        {
          icon: Download,
          title: m['recast.feature_library_title'](),
          body: m['recast.feature_library_body'](),
        },
        {
          icon: Smartphone,
          title: m['recast.feature_browser_title'](),
          body: m['recast.feature_browser_body'](),
        },
      ];
  const tips = uptown
    ? [
        {
          title: m['home.tip_full_title'](),
          body: m['home.tip_full_body'](),
        },
        {
          title: m['home.tip_face_title'](),
          body: m['home.tip_face_body'](),
        },
        {
          title: m['home.tip_light_title'](),
          body: m['home.tip_light_body'](),
        },
        {
          title: m['home.tip_one_title'](),
          body: m['home.tip_one_body'](),
        },
        {
          title: m['home.tip_clothes_title'](),
          body: m['home.tip_clothes_body'](),
        },
        {
          title: m['home.tip_review_title'](),
          body: m['home.tip_review_body'](),
        },
      ]
    : [
        {
          title: m['recast.tip_person_title'](),
          body: m['recast.tip_person_body'](),
        },
        {
          title: m['recast.tip_light_title'](),
          body: m['recast.tip_light_body'](),
        },
        {
          title: m['recast.tip_face_title'](),
          body: m['recast.tip_face_body'](),
        },
        {
          title: m['recast.tip_body_title'](),
          body: m['recast.tip_body_body'](),
        },
        {
          title: content.motionTitle,
          body: content.motionBody,
        },
        {
          title: m['recast.tip_review_title'](),
          body: m['recast.tip_review_body'](),
        },
      ];
  const questions = uptown
    ? [
        { question: m['home.faq_q1'](), answer: m['home.faq_a1']() },
        { question: m['home.faq_q2'](), answer: m['home.faq_a2']() },
        { question: m['home.faq_q3'](), answer: m['home.faq_a3']() },
        { question: m['home.faq_q4'](), answer: m['home.faq_a4']() },
        { question: m['home.faq_q5'](), answer: m['home.faq_a5']() },
        { question: m['home.faq_q6'](), answer: m['home.faq_a6']() },
      ]
    : [
        ...(peeper
          ? [
              {
                question: m['effect.peeper.faq_price_q'](),
                answer: (
                  <>
                    {m['effect.peeper.price_heading']()}{' '}
                    <PeeperPriceCite compare />
                  </>
                ),
              },
            ]
          : []),
        {
          question: m['effect.faq_photo_q'](),
          answer: m['effect.faq_photo_a'](),
        },
        { question: m['effect.faq_prompt_q'](), answer: content.scene },
        {
          question: m['effect.faq_cost_q'](),
          answer: m['effect.faq_cost_a'](),
        },
        {
          question: content.faqSourceQuestion,
          answer: content.faqSourceAnswer,
        },
        {
          question: m['effect.faq_download_q'](),
          answer: m['effect.faq_download_a'](),
        },
        {
          question: m['effect.faq_failure_q'](),
          answer: m['effect.faq_failure_a'](),
        },
      ];
  return (
    <div className="trend-site min-h-screen" lang={locale}>
      <Header
        brandMark="trend"
        campaign={campaign}
        nav={uptown ? 'uptown' : 'effects'}
      />
      <ScrollReveal>
        <main>
          <section className="trend-stage trend-hero" id="hero">
            <div className="trend-container">
              <p className="trend-sticker">{content.eyebrow}</p>
              <h1 className="trend-hero-title">{content.title}</h1>
              {peeper ? (
                <>
                  <h2 className="trend-price-line">
                    {m['effect.peeper.price_heading']()}
                  </h2>
                  <p className="trend-hero-description">
                    <PeeperCompareLink />
                  </p>
                </>
              ) : null}
              <p className="trend-hero-description">{content.description}</p>
              {peeper ? (
                <p className="trend-hero-description">
                  <PeeperPriceCite />
                </p>
              ) : null}
              <p className="trend-update">
                <time dateTime={updatedAt}>
                  {m['recast.updated']({
                    date: formatPostDate(`${updatedAt}T00:00:00Z`, locale),
                  })}
                </time>
                <span aria-hidden="true"> · </span>
                {uptown
                  ? m['home.update_note']()
                  : peeper
                    ? m['recast.peeper.update_note']()
                    : bridges
                      ? m['recast.bridges.update_note']()
                      : m['recast.update_note']()}
              </p>
              <a
                href="#create"
                className="trend-button trend-button-secondary trend-hero-link"
              >
                {uptown ? m['home.cta']() : m['effect.create_cta']()}
                <ArrowRight className="size-4" />
              </a>
              <div className="trend-hero-workspace">
                {bridges && shownHero.length > 0 && (
                  <>
                    <div
                      className="trend-compare"
                      aria-label={content.previewTitle}
                    >
                      {shownHero.map((preview, index) => (
                        <figure
                          key={preview.id ?? preview.src}
                          className="trend-compare-clip"
                        >
                          <span className="trend-compare-label">
                            {index === 0
                              ? content.previewReference
                              : m['recast.preview_ai']()}
                          </span>
                          <ViewportVideo
                            src={preview.src}
                            poster={preview.poster}
                            ariaLabel={preview.title}
                            rootMargin="0px"
                            deferPoster
                            controls
                            className="aspect-[9/16] h-full w-full object-cover"
                          />
                        </figure>
                      ))}
                    </div>
                    <div className="trend-preview-captions">
                      <span>{m['recast.preview_scene']()}</span>
                      <span>{m['effect.one_photo']()}</span>
                      <span>{m['effect.no_prompt']()}</span>
                    </div>
                  </>
                )}
                <div id="create" className="trend-generator scroll-mt-24">
                  <AgentHeaderProvider>
                    <CreateVideo
                      key={campaign}
                      campaign={campaign}
                      embedded
                      generatedCount={generatedCount}
                      voice={uptown ? 'uptown' : undefined}
                    />
                  </AgentHeaderProvider>
                </div>
                {!bridges &&
                  shownHero.length > 0 &&
                  (peeper ? (
                    <div className="trend-hero-showcase trend-peeper-showcase trend-showcase-grid">
                      {shownHero.map((demo) => (
                        <figure
                          data-reveal
                          key={demo.id ?? demo.src}
                          className="trend-showcase-card"
                        >
                          <ViewportVideo
                            src={demo.src}
                            poster={demo.poster}
                            ariaLabel={demo.title}
                            rootMargin="0px"
                            deferPoster
                            controls
                            compactMuteToggle
                            className="trend-showcase-video"
                          />
                          {demo.id === 'example' ? (
                            <figcaption>{demo.title}</figcaption>
                          ) : null}
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className="trend-hero-showcase trend-showcase-grid">
                      {shownHero.map((demo) => (
                        <figure
                          data-reveal
                          key={demo.id ?? demo.src}
                          className="trend-showcase-card"
                        >
                          <ViewportVideo
                            src={demo.src}
                            poster={demo.poster}
                            ariaLabel={demo.title}
                            rootMargin="0px"
                            deferPoster
                            controls
                            compactMuteToggle
                            className="trend-showcase-video"
                          />
                          <figcaption>
                            {demo.cite ? (
                              <a
                                href={demo.cite}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {demo.title}
                              </a>
                            ) : (
                              demo.title
                            )}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          </section>

          {peeper && (
            <section className="trend-section peeper-case-section">
              <div className="trend-container">
                <WindowPeeperCase
                  inputSrc={WINDOW_PEEPER_CASE.input}
                  videoSrc={WINDOW_PEEPER_CASE.src}
                  poster={WINDOW_PEEPER_CASE.poster}
                  inputLabel={m['effect.peeper.case_input']()}
                  resultLabel={m['effect.peeper.case_result']()}
                  caption={m['effect.peeper.case_caption']()}
                />
              </div>
            </section>
          )}

          <section id="about" className="trend-section trend-introduce">
            <div className="trend-container">
              <SectionHeading
                eyebrow={
                  uptown
                    ? m['home.about_eyebrow']()
                    : m['recast.short_answer']()
                }
                title={content.definitionTitle}
              />
              <p className="trend-summary">{content.summary}</p>
              <p className="trend-section-description">{content.definition}</p>
              <p className="trend-section-description">
                {content.origin}
                {content.source ? (
                  <>
                    {' '}
                    <a
                      href={content.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="trend-source"
                    >
                      {m['effect.origin_link']()}
                    </a>
                  </>
                ) : null}
              </p>
              <div className="trend-intro-grid">
                {facts.map((fact) => (
                  <article key={fact.title}>
                    <h3>{fact.title}</h3>
                    <p>{fact.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="usage" className="trend-section trend-stage">
            <div className="trend-container">
              <SectionHeading
                eyebrow={
                  uptown
                    ? m['home.steps_eyebrow']()
                    : m['effect.steps_eyebrow']()
                }
                title={
                  uptown ? m['home.steps_title']() : m['effect.steps_title']()
                }
                description={content.stepsDescription}
              />
              <ol className="trend-steps">
                {steps.map((step, index) => (
                  <li data-reveal key={step.title}>
                    <span className="trend-step-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="trend-step-body">
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {galleryClips.length > 0 && (
            <section
              id="examples"
              className="trend-section trend-showcase scroll-mt-20"
            >
              <div className="trend-container">
                <SectionHeading
                  eyebrow={m['trend.examples_eyebrow']()}
                  title={m['effect.examples_title']()}
                  description={
                    uptown
                      ? m['home.examples_description']()
                      : peeper
                        ? m['effect.peeper.examples_description']()
                        : bridges
                          ? m['effect.examples_description']()
                          : m['trend.bulin_examples_description']()
                  }
                />
                <div
                  className={
                    peeper
                      ? 'trend-showcase-grid trend-peeper-showcase'
                      : bridges
                        ? 'trend-showcase-grid trend-showcase-grid--three'
                        : 'trend-showcase-grid trend-showcase-grid--two'
                  }
                >
                  {galleryClips.map((demo) => (
                    <figure
                      data-reveal
                      key={demo.id ?? demo.src}
                      className="trend-showcase-card"
                    >
                      <ViewportVideo
                        src={demo.src}
                        poster={demo.poster}
                        ariaLabel={demo.title}
                        rootMargin="0px"
                        deferPoster
                        controls
                        className="trend-showcase-video"
                      />
                      {!peeper || demo.id === 'example' ? (
                        <figcaption>{demo.title}</figcaption>
                      ) : null}
                    </figure>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="trend-section trend-features" id="features">
            <div className="trend-container">
              <SectionHeading
                eyebrow={
                  uptown
                    ? m['home.features_eyebrow']()
                    : m['recast.features_eyebrow']()
                }
                title={content.featuresTitle}
                description={
                  uptown
                    ? m['home.features_description']()
                    : m['recast.features_description']()
                }
              />
              <div className="trend-feature-grid">
                {features.map((feature, index) => (
                  <article
                    data-reveal
                    key={feature.title}
                    className="trend-feature-card"
                  >
                    <div className="trend-feature-top">
                      <span className="trend-feature-icon">
                        <feature.icon className="size-5" />
                      </span>
                      <span className="trend-card-number">
                        /{String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="trend-section trend-tips" id="tips">
            <div className="trend-container">
              <SectionHeading
                eyebrow={
                  uptown ? m['home.tips_eyebrow']() : m['recast.tips_eyebrow']()
                }
                title={
                  uptown ? m['home.tips_title']() : m['recast.tips_title']()
                }
                description={
                  uptown
                    ? m['home.tips_description']()
                    : m['recast.tips_description']()
                }
              />
              <div className="trend-feature-grid">
                {tips.map((tip, index) => (
                  <article
                    data-reveal
                    key={tip.title}
                    className="trend-feature-card"
                  >
                    <span className="trend-card-number">
                      /{String(index + 1).padStart(2, '0')}
                    </span>
                    <h3>{tip.title}</h3>
                    <p>{tip.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <TrendGuides
            posts={relatedPosts}
            locale={locale}
            eyebrow={m['recast.guides_eyebrow']()}
            title={m['recast.guides_title']()}
            description={m['recast.guides_description']()}
            readLabel={m['recast.read_guide']()}
            viewAllLabel={m['landing.blog.view_all']()}
          />

          {uptown ? (
            <section className="trend-section trend-next" id="beats">
              <div className="trend-container">
                <SectionHeading
                  eyebrow={m['home.beats_eyebrow']()}
                  title={m['home.beats_title']()}
                  description={m['home.beats_description']()}
                />
                <div className="trend-next-grid trend-next-grid--three">
                  {(
                    [
                      [
                        m['home.beat_strut_title'](),
                        m['home.beat_strut_body'](),
                      ],
                      [
                        m['home.beat_serenade_title'](),
                        m['home.beat_serenade_body'](),
                      ],
                      [
                        m['home.beat_dance_title'](),
                        m['home.beat_dance_body'](),
                      ],
                    ] as const
                  ).map(([title, body]) => (
                    <article key={title} className="trend-guide-card">
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="trend-section trend-next" id="more-effects">
              <div className="trend-container">
                <SectionHeading
                  eyebrow={m['recast.next_eyebrow']()}
                  title={m['recast.next_title']()}
                  description={m['recast.next_description']()}
                />
                <div className="trend-next-grid trend-next-grid--three">
                  {liveEffectNav().map((effect) => (
                    <Link
                      key={effect.id}
                      href={effect.createHref}
                      className="trend-guide-card"
                    >
                      <h3>{effect.title}</h3>
                      <p>
                        {effect.id === 'bridges'
                          ? m['recast.bridges.card_description']()
                          : effect.id === 'peeper'
                            ? m['recast.peeper.card_description']()
                            : effect.id === 'sorry'
                              ? m['ai_video.sorry_body']()
                              : m['recast.bulin.card_description']()}
                      </p>
                      <span>
                        {m['effect.create_cta']()}{' '}
                        <ArrowRight className="size-4" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="trend-section trend-pricing">
            <div className="trend-container">
              <Pricing
                title={
                  uptown
                    ? m['home.pricing_title']()
                    : m['effect.pricing_title']()
                }
                headingLevel={2}
                tone="cinematic"
                defaultGroup="yearly"
                placement="home"
              />
              <p className="trend-pricing-note">{m['trend.pricing_note']()}</p>
            </div>
          </section>

          <section
            id="faq"
            className="trend-section trend-faq-section scroll-mt-20"
          >
            <div className="trend-container">
              <SectionHeading
                eyebrow={
                  uptown ? m['home.faq_eyebrow']() : m['recast.faq_eyebrow']()
                }
                title={uptown ? m['home.faq_title']() : m['effect.faq_title']()}
                description={
                  uptown
                    ? m['home.faq_description']()
                    : m['recast.faq_description']()
                }
              />
              <div className="trend-faq-list">
                {questions.map((item, index) => (
                  <details
                    className="trend-faq"
                    key={item.question}
                    open={index === 0 ? true : undefined}
                  >
                    <summary>
                      <span className="trend-card-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{item.question}</span>
                    </summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="trend-section trend-end-cta">
            <div className="trend-container trend-cta-box">
              <h2 className="trend-section-title">{content.ctaTitle}</h2>
              <p>{content.ctaDescription}</p>
              <div className="trend-cta-actions">
                <a href="#create" className="trend-button trend-button-primary">
                  {uptown ? m['home.cta']() : m['effect.create_cta']()}
                  <ArrowRight className="size-4" />
                </a>
                <a
                  href="#pricing"
                  className="trend-button trend-button-secondary"
                >
                  {m['landing.nav.pricing']()}
                </a>
              </div>
            </div>
          </section>
        </main>
      </ScrollReveal>
      <Footer posts={relatedPosts} focus={uptown ? 'uptown' : undefined} />
      <SupportWidget />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="trend-section-heading" data-reveal>
      <p className="trend-eyebrow">{eyebrow}</p>
      <h2 className="trend-section-title">{title}</h2>
      {description && (
        <p className="trend-section-description">{description}</p>
      )}
    </div>
  );
}
