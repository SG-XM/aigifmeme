/// <reference types="vite/client" />
import { Suspense, useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  createRootRoute,
  HeadContent,
  notFound,
  Outlet,
  Scripts,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ThemeProvider } from 'next-themes';
import { messagePreloadLinks } from 'virtual:bulin-msg-preloads';

import { useSession } from '@/core/auth/client';
import { ensureRest } from '@/core/i18n/message-runtime';
import { usePathname } from '@/core/i18n/navigation';
import { isMessagesShellOnlyPath } from '@/core/i18n/shell-path';
import { envConfigs } from '@/config';
import { apiPost } from '@/lib/api-client';
import { isGonePath } from '@/lib/gone-paths';
import { sanitizeGoogleAnalyticsId } from '@/lib/google-analytics-id';
import { getQueryClient } from '@/lib/query-client';
import { canonicalOrigin } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import {
  baseLocale,
  getLocale,
  locales,
  localizeUrl,
} from '@/paraglide/runtime.js';
import { DuoUpgradeOffer } from '@/blocks/duo-upgrade-offer';
import { VideoRetentionOffer } from '@/blocks/video-retention-offer';
import { Ads } from '@/components/analytics/ads';
import { Clarity } from '@/components/analytics/clarity';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { Plausible } from '@/components/analytics/plausible';
import { AuthPrompt } from '@/components/auth-prompt';
import { CustomerService } from '@/components/customer-service';
import { GoogleOneTap } from '@/components/google-one-tap';
import { Toaster } from '@/components/ui/sonner';

import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/space-grotesk';
import '@fontsource/anton/latin-400.css';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/600.css';
import '@fontsource/ibm-plex-serif/400-italic.css';
import '@/styles/globals.css';

// Analytics IDs live in the DB config (1h-cached service). Fetched via a
// server function so drizzle/db code never reaches the client bundle.
function clarityProjectId(value: string | undefined) {
  const id = value?.trim() ?? '';
  return /^[a-z0-9]+$/i.test(id) ? id : '';
}

const getAnalyticsConfigs = createServerFn().handler(async () => {
  const { getAllConfigs } = await import('@/modules/config/service');
  const configs = await getAllConfigs();
  return {
    appName: configs.app_name?.trim() || envConfigs.app_name,
    appDescription:
      configs.app_description?.trim() || envConfigs.app_description,
    clarityId: clarityProjectId(configs.clarity_project_id),
    gaId: sanitizeGoogleAnalyticsId(configs.google_analytics_id),
    plausibleDomain: configs.plausible_domain?.trim() || '',
    plausibleSrc: configs.plausible_src?.trim() || '',
    adsenseCode: configs.adsense_code?.trim() || '',
    crispWebsiteId:
      configs.crisp_enabled === 'true'
        ? configs.crisp_website_id?.trim() || ''
        : '',
    tawkPropertyId:
      configs.tawk_enabled === 'true'
        ? configs.tawk_property_id?.trim() || ''
        : '',
    tawkWidgetId:
      configs.tawk_enabled === 'true'
        ? configs.tawk_widget_id?.trim() || ''
        : '',
  };
});

export const Route = createRootRoute({
  loader: () => getAnalyticsConfigs(),
  beforeLoad: async ({ location }) => {
    // Document requests already 410 in src/server.ts. This stops a client
    // navigation from painting the retired page without a new document.
    if (!import.meta.env.SSR && isGonePath(location.pathname)) {
      throw notFound();
    }
    if (import.meta.env.SSR) return;
    if (isMessagesShellOnlyPath(location.pathname)) return;
    await ensureRest(getLocale());
  },
  head: ({ matches, loaderData }) => {
    // head() runs on the SSR server AND again on the client during hydration.
    // Homepage canonical stays on https://filemetawipe.com. Other pages use
    // the live origin, except workers.dev and the parent Uptown hosts.
    const pagePath = matches.at(-1)?.pathname || '/';
    const appUrl = canonicalOrigin(
      (typeof window !== 'undefined' && window.location?.origin) ||
        envConfigs.app_url ||
        '',
      pagePath
    );
    const pageData = matches.at(-1)?.loaderData as
      | { description?: string; post?: { localizedLocales?: string[] } }
      | undefined;
    const pageLocales = pageData?.post?.localizedLocales;
    const alternateLocales = pageLocales
      ? locales.filter((loc) => pageLocales.includes(loc))
      : locales;
    const xDefault = alternateLocales.includes(baseLocale)
      ? baseLocale
      : (alternateLocales[0] ?? baseLocale);
    // Social-card defaults. A route's own head() overrides the ones it repeats
    // (title/description), so pages only restate what differs.
    const ogImage = `${appUrl}/og.png`;
    const appName = loaderData?.appName || envConfigs.app_name;
    const siteDescription =
      (pagePath === '/' && pageData?.description) ||
      loaderData?.appDescription ||
      envConfigs.app_description;
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: appName },
        { name: 'description', content: siteDescription },
        { property: 'og:site_name', content: appName },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: appName },
        { property: 'og:description', content: siteDescription },
        { property: 'og:url', content: appUrl },
        { property: 'og:image', content: ogImage },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: appName },
        { name: 'twitter:description', content: siteDescription },
        { name: 'twitter:image', content: ogImage },
      ],
      links: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '192x192',
          href: '/icon-192.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '512x512',
          href: '/icon-512.png',
        },
        {
          rel: 'apple-touch-icon',
          href: '/apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
        ...alternateLocales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: localizeUrl(`${appUrl}${pagePath}`, { locale: loc }).href,
        })),
        {
          rel: 'alternate',
          hrefLang: 'x-default',
          href: localizeUrl(`${appUrl}${pagePath}`, { locale: xDefault }).href,
        },
        ...messagePreloadLinks(getLocale(), pagePath),
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': `${appUrl}/#organization`,
                name: appName,
                url: `${appUrl}/`,
                logo: `${appUrl}/logo.png`,
                contactPoint: {
                  '@type': 'ContactPoint',
                  contactType: 'customer support',
                  url: `${appUrl}/contact`,
                },
              },
              {
                '@type': 'WebSite',
                '@id': `${appUrl}/#website`,
                name: appName,
                description: siteDescription,
                url: `${appUrl}/`,
                publisher: { '@id': `${appUrl}/#organization` },
              },
            ],
          }).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootComponent() {
  const analytics = Route.useLoaderData();
  const { data: session } = useSession();
  const pathname = usePathname();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    void apiPost('/api/funnel/event', { event: 'identify' }).catch(
      () => undefined
    );
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const reportVisit = () => {
      if (document.visibilityState !== 'visible') return;
      void apiPost('/api/user/last-visit').catch(() => undefined);
    };

    reportVisit();
    window.addEventListener('focus', reportVisit);
    document.addEventListener('visibilitychange', reportVisit);
    return () => {
      window.removeEventListener('focus', reportVisit);
      document.removeEventListener('visibilitychange', reportVisit);
    };
  }, [userId, pathname]);

  return (
    <QueryClientProvider client={getQueryClient()}>
      {/* Match the homepage by default; preserve an explicit theme preference. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <Outlet />
        <Suspense fallback={null}>
          <VideoRetentionOffer />
        </Suspense>
        <Suspense fallback={null}>
          <DuoUpgradeOffer />
        </Suspense>
        <Toaster position="top-center" richColors />
        <GoogleOneTap />
        <Suspense fallback={null}>
          <AuthPrompt />
        </Suspense>
        {analytics?.gaId ? (
          <GoogleAnalytics measurementId={analytics.gaId} />
        ) : null}
        {analytics?.clarityId ? (
          <Clarity projectId={analytics.clarityId} />
        ) : null}
        {analytics?.plausibleDomain || analytics?.plausibleSrc ? (
          <Plausible
            domain={analytics.plausibleDomain}
            src={analytics.plausibleSrc || undefined}
          />
        ) : null}
        {analytics?.adsenseCode ? <Ads code={analytics.adsenseCode} /> : null}
        <CustomerService
          crispWebsiteId={analytics?.crispWebsiteId || undefined}
          tawkPropertyId={analytics?.tawkPropertyId || undefined}
          tawkWidgetId={analytics?.tawkWidgetId || undefined}
        />
      </ThemeProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html
      lang={getLocale()}
      dir={getLocale() === 'ar' ? 'rtl' : 'ltr'}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-muted-foreground">{m['common.not_found.message']()}</p>
      <a href="/" className="text-sm underline underline-offset-4">
        {m['common.not_found.back_home']()}
      </a>
    </div>
  );
}

function RootError({ error }: ErrorComponentProps) {
  const isArabic = getLocale() === 'ar';
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{isArabic ? 'عذرًا' : 'Oops'}</h1>
      <p className="text-muted-foreground">
        {isArabic
          ? 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.'
          : 'Something went wrong. Please try again.'}
      </p>
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="bg-muted mt-2 max-w-lg overflow-auto rounded p-4 text-xs">
          {error.message}
        </pre>
      )}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-sm underline underline-offset-4"
      >
        {isArabic ? 'حاول مرة أخرى' : 'Try again'}
      </button>
    </div>
  );
}
