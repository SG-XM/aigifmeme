import { createFileRoute } from '@tanstack/react-router';

import {
  PDF_METADATA_PATH,
  PDF_METADATA_UPDATED_AT,
  pdfMetadataCopy,
} from '@/lib/pdf-metadata-content';
import { getSiteNameFn } from '@/lib/site-name-server';
import { PUBLIC_SITE_ORIGIN } from '@/lib/trend-page-meta';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { PdfMetadataRemover } from '@/blocks/pdf-metadata-remover';

export const Route = createFileRoute('/pdf-metadata-remover')({
  loader: async () => {
    const locale = getLocale();
    const siteName = await getSiteNameFn();
    const copy = pdfMetadataCopy(locale);
    return {
      locale,
      siteName,
      title: `${copy.meta_title} | ${siteName}`,
      description: copy.meta_description,
      name: copy.title,
      home: copy.breadcrumb_home,
    };
  },
  head: ({ loaderData: d }) => {
    if (!d) return {};
    const urlFor = (locale: (typeof locales)[number]) =>
      localizeUrl(`${PUBLIC_SITE_ORIGIN}${PDF_METADATA_PATH}`, { locale }).href;
    const url = urlFor(d.locale);
    const image = `${PUBLIC_SITE_ORIGIN}/images/pdf-metadata/pdf-properties-eraser.webp`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          name: d.title,
          description: d.description,
          inLanguage: d.locale,
          dateModified: PDF_METADATA_UPDATED_AT,
          author: { '@id': `${PUBLIC_SITE_ORIGIN}/#organization` },
          mainEntity: { '@id': `${url}#application` },
          breadcrumb: { '@id': `${url}#breadcrumb` },
        },
        {
          '@type': 'WebApplication',
          '@id': `${url}#application`,
          name: d.name,
          url,
          description: d.description,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Any',
          browserRequirements: 'Requires JavaScript',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          image,
          provider: { '@id': `${PUBLIC_SITE_ORIGIN}/#organization` },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${url}#breadcrumb`,
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: d.home,
              item: localizeUrl(`${PUBLIC_SITE_ORIGIN}/`, { locale: d.locale })
                .href,
            },
            { '@type': 'ListItem', position: 2, name: d.name, item: url },
          ],
        },
      ],
    };
    return {
      meta: [
        { title: d.title },
        { name: 'description', content: d.description },
        { property: 'og:title', content: d.title },
        { property: 'og:description', content: d.description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: image },
        { property: 'og:image:width', content: '960' },
        { property: 'og:image:height', content: '640' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: d.title },
        { name: 'twitter:description', content: d.description },
        { name: 'twitter:image', content: image },
      ],
      links: [{ rel: 'canonical', href: url }],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
  component: PdfPage,
});

function PdfPage() {
  const { siteName } = Route.useLoaderData();
  return <PdfMetadataRemover siteName={siteName} />;
}
