import { AI_VIDEO_INDEX_PATH, WINDOW_PEEPER_PATH } from '@/lib/ai-video-paths';
import { m } from '@/paraglide/messages.js';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';
import type { BlogPost } from '@/content/posts';

export function Footer({
  posts = [],
}: {
  posts?: Pick<BlogPost, 'slug' | 'title'>[];
}) {
  const columns: FooterColumn[] = [
    {
      title: m['landing.footer.product'](),
      links: [
        { label: m['landing.nav.create'](), href: '/#create' },
        { label: m['home.brand_name'](), href: '/' },
        { label: m['ai_video.kicker'](), href: AI_VIDEO_INDEX_PATH },
        { label: m['trend.bridges.title'](), href: '/burning-bridges-ai' },
        { label: m['trend.peeper.title'](), href: WINDOW_PEEPER_PATH },
        { label: m['sorry.nav'](), href: '/im-so-sorry' },
        { label: m['landing.nav.pricing'](), href: '/pricing' },
      ],
      // Posts for this page, directly under Pricing. Effect pages pass
      // the tag-matched list; an empty list simply renders no section.
      sections: posts.length
        ? [
            {
              title: m['blog.title'](),
              links: posts.map((post) => ({
                label: post.title,
                href: `/blog/${encodeURIComponent(post.slug)}`,
              })),
            },
          ]
        : [],
    },
    {
      title: m['landing.nav.guides'](),
      links: [{ label: m['landing.footer.all_guides'](), href: '/blog' }],
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
  ];

  return (
    <SiteFooter tagline={m['landing.footer.tagline']()} columns={columns} />
  );
}
