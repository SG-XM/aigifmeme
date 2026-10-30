import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { WallpaperPeeper } from '@/blocks/wallpaper-peeper';

/**
 * Live FreeRap dogfood page for the window-peeper template.
 * Retired `/window-peeper`, `/window-peeper-ai`, and `/ai-video/window-peeper`
 * stay HTTP 410.
 */
export const Route = createFileRoute('/wallpaper-peeper')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: () => {
    const locale = getLocale();
    return {
      title: m['wallpaper_peeper.meta.title']({}, { locale }),
      description: m['wallpaper_peeper.meta.description']({}, { locale }),
    };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? m['wallpaper_peeper.meta.title']();
    const description =
      loaderData?.description ?? m['wallpaper_peeper.meta.description']();
    const canonical = localizeUrl(`${envConfigs.app_url}/wallpaper-peeper`, {
      locale: getLocale(),
    }).href;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { name: 'robots', content: 'noindex, nofollow' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: canonical },
      ],
      links: [
        { rel: 'canonical', href: canonical },
        ...locales.map((locale) => ({
          rel: 'alternate',
          hrefLang: locale,
          href: localizeUrl(`${envConfigs.app_url}/wallpaper-peeper`, {
            locale,
          }).href,
        })),
      ],
    };
  },
  component: WallpaperPeeperPage,
});

function WallpaperPeeperPage() {
  return (
    <div className="trend-site flex min-h-screen flex-col">
      <Header nav="uptown" />
      <main className="flex-1">
        <WallpaperPeeper />
      </main>
      <Footer focus="uptown" />
    </div>
  );
}
