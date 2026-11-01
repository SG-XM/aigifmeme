import { createFileRoute } from '@tanstack/react-router';

import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale, type Locale } from '@/paraglide/runtime.js';
import { MetadataRemoverHome } from '@/blocks/metadata-remover-home';

/** Homepage copy revision. Other trend pages keep TREND_PAGE_UPDATED_AT. */
const HOME_UPDATED_AT = '2026-11-01';

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function homeFaqLd(locale: Locale) {
  const copy = { locale };
  const pairs = [
    [m['home.faq_q1']({}, copy), m['home.faq_a1']({}, copy)],
    [m['home.faq_q2']({}, copy), m['home.faq_a2']({}, copy)],
    [m['home.faq_q3']({}, copy), m['home.faq_a3']({}, copy)],
    [m['home.faq_q4']({}, copy), m['home.faq_a4']({}, copy)],
    [m['home.faq_q5']({}, copy), m['home.faq_a5']({}, copy)],
    [m['home.faq_q6']({}, copy), m['home.faq_a6']({}, copy)],
    [m['home.faq_q7']({}, copy), m['home.faq_a7']({}, copy)],
  ];
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  });
}

function homeHowToLd(locale: Locale) {
  const copy = { locale };
  const steps = [
    [
      m['home.step_upload_title']({}, copy),
      m['home.step_upload_body']({}, copy),
    ],
    [
      m['home.step_generate_title']({}, copy),
      m['home.step_generate_body']({}, copy),
    ],
    [
      m['home.step_download_title']({}, copy),
      m['home.step_download_body']({}, copy),
    ],
  ];
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: m['home.steps_title']({}, copy),
    description: m['home.steps_description']({}, copy),
    step: steps.map(([name, text], index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name,
      text,
    })),
  });
}

export const Route = createFileRoute('/')({
  loader: async () => {
    const locale = getLocale();
    const siteName = await getSiteNameFn();
    return {
      locale,
      siteName,
      title: m['home.meta_title']({}, { locale }),
      description: m['home.meta_description']({}, { locale }),
      summary: m['home.summary']({}, { locale }),
      faqLd: homeFaqLd(locale),
      howToLd: homeHowToLd(locale),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const meta = trendPageMeta({
      ...loaderData,
      path: '/',
      dateModified: HOME_UPDATED_AT,
    });
    return {
      ...meta,
      scripts: [
        ...(meta.scripts ?? []),
        { type: 'application/ld+json', children: loaderData.faqLd },
        { type: 'application/ld+json', children: loaderData.howToLd },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  return <MetadataRemoverHome />;
}
