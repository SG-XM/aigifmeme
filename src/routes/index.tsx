import { createFileRoute } from '@tanstack/react-router';

import { AIGIFMEME_UPDATED_AT } from '@/lib/meme-content';
import { getSiteNameFn } from '@/lib/site-name-server';
import { trendPageMeta } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { getLocale, type Locale } from '@/paraglide/runtime.js';
import { MemeHome } from '@/blocks/meme-home';

function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function homeFaqLd(locale: Locale) {
  const copy = { locale };
  const pairs = [
    [m['meme.faq_q1']({}, copy), m['meme.faq_a1']({}, copy)],
    [m['meme.faq_q2']({}, copy), m['meme.faq_a2']({}, copy)],
    [m['meme.faq_q3']({}, copy), m['meme.faq_a3']({}, copy)],
    [m['meme.faq_q4']({}, copy), m['meme.faq_a4']({}, copy)],
    [m['meme.faq_q5']({}, copy), m['meme.faq_a5']({}, copy)],
    [m['meme.faq_q6']({}, copy), m['meme.faq_a6']({}, copy)],
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
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const meta = trendPageMeta({
      ...loaderData,
      path: '/',
      dateModified: AIGIFMEME_UPDATED_AT,
    });
    return {
      ...meta,
      scripts: [
        ...(meta.scripts ?? []),
        { type: 'application/ld+json', children: loaderData.faqLd },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  return <MemeHome />;
}
