import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { creditPackStartsLine } from '@/lib/credit-pack-starts';
import { leadCreditPack } from '@/lib/public-credit-packs';
import { getPublicCreditPacksFn } from '@/lib/public-credit-packs-fn';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { Pricing } from '@/blocks/pricing';
import { getBlogPostsFn } from '@/content/posts/server';

export const Route = createFileRoute('/pricing')({
  // Catalog currency can be EUR for a euro-area request, and prices change
  // in admin. A shared cache would reuse the wrong HTML.
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async () => {
    const locale = getLocale();
    const [posts, packs] = await Promise.all([
      getBlogPostsFn({ data: { locale } }),
      getPublicCreditPacksFn({ data: locale }),
    ]);
    const description = m['landing.pricing.description']({}, { locale });
    const lead = packs ? leadCreditPack(packs) : null;
    const packLine = lead ? creditPackStartsLine(lead, locale) : '';
    return {
      locale,
      posts,
      packs,
      title: m['landing.pricing.title']({}, { locale }),
      description: packLine ? `${description} ${packLine}` : description,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { title, description, locale } = loaderData;
    const urlFor = (loc: string) =>
      localizeUrl(`${envConfigs.app_url}/pricing`, { locale: loc as any }).href;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: urlFor(locale) },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: [
        { rel: 'canonical', href: urlFor(locale) },
        ...locales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: urlFor(loc),
        })),
      ],
    };
  },
  component: PricingPage,
});

function PricingPage() {
  const { posts, packs } = Route.useLoaderData();
  return (
    <div className="trend-site flex min-h-screen flex-col">
      <Header brandMark="trend" />
      <main className="flex-1">
        <Pricing
          headingLevel={1}
          placement="pricing"
          tone="cinematic"
          initialPacks={packs ?? undefined}
        />
      </main>
      <Footer posts={posts} />
    </div>
  );
}
