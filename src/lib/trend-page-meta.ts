import { envConfigs } from '@/config';
import { resolveSiteName } from '@/lib/site-name';
import { locales, localizeUrl, type Locale } from '@/paraglide/runtime.js';

/** Actual content revision date, shared with the visible page update line. */
export const TREND_PAGE_UPDATED_AT = '2026-10-11';

/** Shared metadata keeps both keyword pages and their language versions aligned. */
export function trendPageMeta({
  locale,
  title,
  description,
  path,
  summary = description,
  siteName,
  dateModified = TREND_PAGE_UPDATED_AT,
}: {
  locale: Locale;
  title: string;
  description: string;
  path: string;
  summary?: string;
  /** Admin (DB) app_name from the route loader; env name is the fallback. */
  siteName?: string;
  dateModified?: string;
}) {
  const baseUrl = envConfigs.app_url.replace(/\/$/, '');
  const urlFor = (language: Locale) =>
    localizeUrl(`${baseUrl}${path}`, { locale: language }).href;
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: urlFor(locale) },
      { property: 'og:image', content: `${baseUrl}/logo.png` },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: `${baseUrl}/logo.png` },
    ],
    links: [
      { rel: 'canonical', href: urlFor(locale) },
      ...locales.map((language) => ({
        rel: 'alternate',
        hrefLang: language,
        href: urlFor(language),
      })),
      { rel: 'alternate', hrefLang: 'x-default', href: urlFor('en') },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `${urlFor(locale)}#webpage`,
          url: urlFor(locale),
          name: title,
          description: summary,
          inLanguage:
            locale === 'zh'
              ? 'zh-CN'
              : locale === 'es'
                ? 'es'
                : locale === 'ar'
                  ? 'ar'
                  : 'en',
          dateModified,
          isPartOf: {
            '@type': 'WebSite',
            name: resolveSiteName(siteName, envConfigs.app_name),
            url: `${baseUrl}/`,
          },
        }).replace(/</g, '\\u003c'),
      },
    ],
  };
}
