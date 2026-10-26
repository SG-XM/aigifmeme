import type { ComponentType, SVGProps } from 'react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { cn } from '@/lib/utils';
import { withUtmSource } from '@/lib/utm';
import { LocaleSelector } from '@/components/locale-selector';

export interface FooterColumn {
  title: string;
  /** external: open in a new tab. Off-site (http) hrefs always open in a new tab. */
  links: { label: string; href: string; external?: boolean }[];
  /** Extra headed link groups rendered below `links` in the same column. */
  sections?: { title: string; links: FooterColumn['links'] }[];
}

/** Off-site URLs render as plain <a>; internal paths use the locale-aware Link. */
const isExternalHref = (href: string) => /^https?:\/\//.test(href);

export interface FooterSocial {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  label: string;
}

/** Directory badges. Raw anchors stay in the homepage HTML so checkers can see them. */
const directoryBadges: {
  href: string;
  alt: string;
  src?: string;
  label?: string;
  title?: string;
}[] = [
  {
    href: 'https://huntfortools.com/tool/uptownfunkai',
    src: 'https://huntfortools.com/assets/images/badge.png',
    alt: 'Hunt for Tools',
  },
  {
    href: 'https://weliketools.com/tool/uptownfunkai',
    src: 'https://weliketools.com/assets/images/badge.png',
    alt: 'We Like Tools',
  },
  {
    href: 'https://toshilist.com/product/uptownfunkai',
    src: 'https://toshilist.com/assets/images/badge.png',
    alt: 'Toshi List',
  },
  {
    href: 'https://stackdirectory.com/product/uptownfunkai',
    src: 'https://stackdirectory.com/assets/images/badge.png',
    alt: 'Stack Directory',
  },
  {
    href: 'https://saasroots.com/product/uptownfunkai',
    src: 'https://saasroots.com/assets/images/badge.png',
    alt: 'SaaS Roots',
  },
  {
    href: 'https://softwarebolt.com/product/uptownfunkai',
    src: 'https://softwarebolt.com/assets/images/badge.png',
    alt: 'Software Bolt',
  },
  {
    href: 'https://startupbenchmarks.com/product/uptownfunkai',
    src: 'https://startupbenchmarks.com/assets/images/badge.png',
    alt: 'Startup Benchmarks',
  },
  {
    href: 'https://saasfield.com/ai/uptownfunkai',
    src: 'https://saasfield.com/assets/images/badge.png',
    alt: 'SaaS Field',
  },
  {
    href: 'https://toolfinddir.com/ai/uptownfunkai',
    src: 'https://toolfinddir.com/assets/images/badge.png',
    alt: 'Tool Find Dir',
  },
  {
    href: 'https://besttoolvault.com/tool/uptownfunkai',
    src: 'https://besttoolvault.com/assets/images/badge.png',
    alt: 'Best Tool Vault',
  },
  {
    href: 'https://launchclash.com/product/uptownfunkai',
    src: 'https://launchclash.com/assets/images/badge.png',
    alt: 'LaunchClash',
  },
  {
    href: 'https://shinylaunch.com/product/uptownfunkai',
    src: 'https://shinylaunch.com/assets/images/badge.png',
    alt: 'ShinyLaunch',
  },
  {
    href: 'https://twelve.tools',
    src: 'https://twelve.tools/badge0-dark.svg',
    alt: 'Featured on Twelve Tools',
  },
  {
    href: 'https://mossai.org',
    alt: 'MossAI Tools',
    label: 'MossAI Tools',
    title: 'MossAI Tools',
  },
  {
    href: 'https://fazier.com',
    src: 'https://fazier.com/api/v1/public/badges/launch_badges.svg?badge_type=launched&theme=light',
    alt: 'Fazier badge',
  },
  {
    href: 'https://startupfa.st',
    src: 'https://startupfa.st/images/badges/powered-by-light.svg',
    alt: 'Powered by Startup Fast',
    title: 'Powered by Startup Fast',
  },
  {
    href: 'https://startupfa.st/projects/bulin-ai',
    src: 'https://startupfa.st/badge-light.png',
    alt: 'Featured on Startup Fast',
    title: 'Featured on Startup Fast',
  },
  {
    href: 'https://startupfa.me/s/bulin-47-ai-1?utm_source=uptownfunkai.video',
    src: 'https://startupfa.me/badges/featured-badge-small.webp',
    alt: 'Uptown - Featured on Startup Fame',
  },
  {
    href: 'https://www.showmysites.com',
    src: 'https://www.showmysites.com/static/backlink/logo.webp',
    alt: 'ShowMySites Badge',
  },
  {
    href: 'https://artificin.com?utm_source=badge&utm_medium=referral&utm_campaign=featured_badge',
    src: 'https://artificin.com/badges/Artificin-badge.png',
    alt: 'Featured on Artificin',
  },
  {
    href: 'https://showmebest.ai',
    src: 'https://showmebest.ai/badge/feature-badge-dark.webp',
    alt: 'Featured on ShowMeBestAI',
  },
  {
    href: 'https://firstlook.tools',
    src: 'https://firstlook.tools/badge/badge_dark.svg',
    alt: 'Featured on First Look',
  },
  {
    href: 'https://deeplaunch.io',
    src: 'https://deeplaunch.io/badge/badge_dark.svg',
    alt: 'Featured on DeepLaunch.io',
  },
  {
    href: 'https://aiagentsdirectory.com/agent/bulin-ai',
    src: 'https://aiagentsdirectory.com/featured-badge.svg?v=2024',
    alt: 'Uptown - Featured on AI Agents Directory',
    title: 'Discover Uptown on AI Agents Directory',
  },
  {
    href: 'https://www.justsimple.tools',
    src: 'https://www.justsimple.tools/badge.svg',
    alt: 'Listed on JustSimple Tools',
  },
  {
    href: 'https://aidirs.org/item/uptown',
    src: 'https://aidirs.org/badges/badge-listed-dark.svg',
    alt: 'Listed on AIDirs',
  },
  {
    href: 'https://domainrank.app',
    src: 'https://domainrank.app/api/badge/uptownfunkai.video?theme=dark',
    alt: 'uptownfunkai.video Domain Rating',
  },
  {
    href: 'https://goodaitools.com/ai/uptownfunkai',
    src: 'https://goodaitools.com/assets/images/badge-dark.png',
    alt: 'Good AI Tools',
  },
];

function DirectoryBadges() {
  if (directoryBadges.length === 0) return null;

  return (
    <div className="border-t border-white/5">
      <div
        className="mx-auto flex h-9 max-w-6xl items-center gap-3 overflow-x-auto px-4 opacity-35 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, #000 1.25rem, #000 calc(100% - 1.25rem), transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, #000 1.25rem, #000 calc(100% - 1.25rem), transparent)',
        }}
      >
        {directoryBadges.map((badge) => (
          <a
            key={badge.href}
            href={badge.href}
            target="_blank"
            rel="noopener"
            title={badge.title}
            className="inline-flex h-6 w-28 shrink-0 items-center justify-center overflow-hidden text-[11px] whitespace-nowrap text-neutral-300"
          >
            {badge.src ? (
              <img
                src={badge.src}
                alt={badge.alt}
                height={54}
                width={112}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="h-6 w-auto max-w-28 object-contain"
              />
            ) : (
              badge.label
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter({
  tagline,
  columns,
  socials,
  copyright,
}: {
  tagline?: string;
  columns?: FooterColumn[];
  socials?: FooterSocial[];
  copyright?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-6 sm:px-6 sm:pt-16">
        {tagline && (
          <p className="mb-12 max-w-2xl font-serif text-3xl leading-[1.15] tracking-tight text-neutral-100 italic sm:text-4xl">
            {tagline}
          </p>
        )}

        {columns && columns.length > 0 && (
          <div
            className={cn(
              'grid gap-x-8 gap-y-10 sm:gap-x-12',
              columns.length <= 3
                ? 'grid-cols-2 sm:grid-cols-3'
                : columns.length === 4
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            )}
          >
            {columns.map((col) => (
              <div key={col.title} className="space-y-5">
                <p className="text-[13px] font-semibold tracking-wide text-neutral-100">
                  {col.title}
                </p>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {isExternalHref(link.href) ? (
                        <a
                          href={withUtmSource(link.href)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          target={link.external ? '_blank' : undefined}
                          className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {col.sections?.map((section) => (
                  <div key={section.title} className="space-y-3 pt-1">
                    <p className="text-[13px] font-semibold tracking-wide text-neutral-100">
                      {section.title}
                    </p>
                    <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {section.links.map((link) => (
                        <li key={link.label}>
                          <Link
                            href={link.href}
                            className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Socials + language row */}
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {socials && socials.length > 0 ? (
            <div className="flex items-center gap-5">
              {socials.map((s) =>
                isExternalHref(s.href) ? (
                  <a
                    key={s.label}
                    href={withUtmSource(s.href)}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-300 transition-colors hover:text-neutral-100"
                  >
                    <s.icon className="size-[18px]" />
                  </a>
                ) : (
                  <Link
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="text-neutral-300 transition-colors hover:text-neutral-100"
                  >
                    <s.icon className="size-[18px]" />
                  </Link>
                )
              )}
            </div>
          ) : (
            <div />
          )}
          <LocaleSelector
            variant="pill"
            className="border-neutral-700 text-neutral-200 hover:bg-white/5 hover:text-neutral-50"
          />
        </div>

        {/* Bottom bar */}
        <div className="mt-6 flex flex-col gap-3 border-t border-neutral-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-neutral-400">
            {copyright ?? (
              <>
                © {year}{' '}
                {/* The brand links home — the one coloured word down here. */}
                <Link
                  href="/"
                  className="text-primary underline underline-offset-4 hover:opacity-80"
                >
                  {envConfigs.app_name}
                </Link>
                . All rights reserved.
              </>
            )}
          </span>
        </div>
      </div>
      <DirectoryBadges />
    </footer>
  );
}
