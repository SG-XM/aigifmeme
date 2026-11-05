import type { ComponentType, SVGProps } from 'react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { cn } from '@/lib/utils';
import { withUtmSource } from '@/lib/utm';
import { LocaleSelector } from '@/components/locale-selector';

export interface FooterColumn {
  title: string;
  /** external: open in a new tab. Off-site (http) hrefs always open in a new tab. */
  links: {
    label: string;
    href: string;
    external?: boolean;
    literal?: boolean;
  }[];
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
    <footer className="meme-footer text-foreground">
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-6 sm:px-6 sm:pt-16">
        {tagline && (
          <p className="text-foreground mb-12 max-w-2xl font-serif text-3xl leading-[1.15] tracking-tight italic sm:text-4xl">
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
                <p className="text-foreground text-[13px] font-semibold tracking-wide">
                  {col.title}
                </p>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={`${link.href}-${link.label}`}>
                      {isExternalHref(link.href) ? (
                        <a
                          href={withUtmSource(link.href)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                        >
                          {link.label}
                        </a>
                      ) : link.literal ? (
                        <a
                          href={link.href}
                          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          target={link.external ? '_blank' : undefined}
                          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {col.sections?.map((section) => (
                  <div key={section.title} className="space-y-3 pt-1">
                    <p className="text-foreground text-[13px] font-semibold tracking-wide">
                      {section.title}
                    </p>
                    <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {section.links.map((link) => (
                        <li key={link.label}>
                          <Link
                            href={link.href}
                            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
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
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <s.icon className="size-[18px]" />
                  </a>
                ) : (
                  <Link
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="border-border mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground text-sm">
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
    </footer>
  );
}
