import { localeNames } from '@/config/locale';
import { AI_VIDEO_INDEX_PATH, WINDOW_PEEPER_PATH } from '@/lib/ai-video-paths';
import { m } from '@/paraglide/messages.js';
import { locales, localizeUrl, type Locale } from '@/paraglide/runtime.js';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';
import type { BlogPost } from '@/content/posts';

/** Locale homes use a fixed prefix. The locale-aware Link would rewrite them. */
function localeHomePath(locale: Locale) {
  return localizeUrl('https://uptownfunkai.video/', { locale }).pathname;
}

export function Footer({
  posts = [],
  focus,
}: {
  posts?: Pick<BlogPost, 'slug' | 'title'>[];
  /** Homepage product column. Effect pages keep the same scene list. */
  focus?: 'uptown';
}) {
  const uptown = focus === 'uptown';
  const sceneLinks = [
    { label: m['ai_video.title'](), href: AI_VIDEO_INDEX_PATH },
    { label: m['effect.bridges.title'](), href: '/burning-bridges-ai' },
    { label: m['effect.peeper.title'](), href: WINDOW_PEEPER_PATH },
    { label: m['sorry.title'](), href: '/im-so-sorry' },
  ];
  const homeTitle = m['home.title']();
  const languageLinks = locales.map((locale) => ({
    label: `${homeTitle} · ${localeNames[locale] ?? locale}`,
    href: localeHomePath(locale),
    literal: true,
  }));
  const columns: FooterColumn[] = [
    {
      title: m['landing.footer.product'](),
      links: uptown
        ? [
            { label: m['home.title'](), href: '/' },
            { label: m['home.nav.create'](), href: '/#create' },
            { label: m['home.nav.how'](), href: '/#usage' },
            { label: m['home.nav.beats'](), href: '/#beats' },
            { label: m['landing.pricing.title'](), href: '/pricing' },
          ]
        : [
            { label: m['home.title'](), href: '/' },
            { label: m['landing.nav.create'](), href: '/#create' },
            ...sceneLinks,
            { label: m['landing.pricing.title'](), href: '/pricing' },
          ],
      sections: [
        ...(uptown
          ? [
              {
                title: m['landing.footer.scenes'](),
                links: sceneLinks,
              },
            ]
          : []),
        ...(posts.length
          ? [
              {
                title: m['blog.title'](),
                links: posts.map((post) => ({
                  label: post.title,
                  href: `/blog/${encodeURIComponent(post.slug)}`,
                })),
              },
            ]
          : []),
      ],
    },
    {
      title: m['landing.nav.guides'](),
      links: [{ label: m['blog.title'](), href: '/blog' }],
    },
    {
      title: m['landing.footer.account'](),
      links: [
        { label: m['agent.nav.library'](), href: '/library' },
        { label: m['settings.nav.payments'](), href: '/settings/payments' },
        { label: m['settings.nav.billing'](), href: '/settings/billing' },
        { label: m['settings.tickets.title'](), href: '/settings/tickets' },
      ],
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

  return (
    <SiteFooter
      tagline={
        uptown ? m['home.footer_tagline']() : m['landing.footer.tagline']()
      }
      columns={columns}
    />
  );
}
