import { localeNames } from '@/config/locale';
import { isHiddenPublicPath } from '@/lib/public-page-visibility';
import { PUBLIC_SITE_ORIGIN } from '@/lib/trend-page-meta';
import { m } from '@/paraglide/messages.js';
import { locales, localizeUrl, type Locale } from '@/paraglide/runtime.js';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';
import type { BlogPost } from '@/content/posts';

/**
 * Locale homes use a fixed prefix. The locale-aware Link would rewrite them.
 * Strip a trailing slash so SSR and the browser emit the same href.
 */
function localeHomePath(locale: Locale) {
  const path =
    localizeUrl(`${PUBLIC_SITE_ORIGIN}/`, { locale }).pathname || '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

export function Footer({
  posts = [],
}: {
  posts?: Pick<BlogPost, 'slug' | 'title'>[];
  /** Kept so older campaign pages can still pass it. Scene links are gone. */
  focus?: 'uptown';
}) {
  const homeTitle = m['home.title']();
  const languageLinks = locales.map((locale) => ({
    label: `${homeTitle} · ${localeNames[locale] ?? locale}`,
    href: localeHomePath(locale),
    literal: true,
  }));
  const columns: FooterColumn[] = [
    {
      title: m['landing.footer.product'](),
      links: [
        { label: m['home.title'](), href: '/' },
        { label: m['home.nav.start'](), href: '/#create' },
        { label: m['home.nav.check'](), href: '/#examples' },
        { label: m['home.nav.formats'](), href: '/#styles' },
        { label: m['home.nav.how'](), href: '/#how' },
        { label: m['landing.pricing.title'](), href: '/pricing' },
      ].filter((link) => !isHiddenPublicPath(link.href)),
    },
    {
      title: m['landing.nav.guides'](),
      links: [
        { label: m['home.about_link'](), href: '/about' },
        { label: m['home.contact_link'](), href: '/contact' },
      ],
    },
    {
      title: m['landing.footer.account'](),
      links: [
        { label: m['settings.nav.credits'](), href: '/settings/credits' },
        { label: m['settings.tickets.title'](), href: '/settings/tickets' },
      ].filter((link) => !isHiddenPublicPath(link.href)),
    },
    {
      title: m['landing.footer.legal'](),
      links: [
        { label: m['landing.footer.privacy'](), href: '/privacy-policy' },
        { label: m['landing.footer.terms'](), href: '/terms-of-service' },
      ],
    },
    {
      title: m['landing.footer.languages'](),
      links: languageLinks,
    },
  ];

  return <SiteFooter tagline={m['home.footer_tagline']()} columns={columns} />;
}
