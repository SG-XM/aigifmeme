import { useEffect, useRef, useState } from 'react';
import { Coins, Flame, Menu, X } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link, usePathname } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { cn } from '@/lib/utils';
import { withUtmSource } from '@/lib/utm';
import { openAuthPrompt } from '@/components/auth-prompt';
import { LocaleSelector } from '@/components/locale-selector';
import { SiteUserMenu } from '@/components/site-user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  TrendingPopup,
  type TrendingPopupCopy,
} from '@/components/trending-popup';
import { buttonVariants } from '@/components/ui/button';

export interface NavLink {
  href: string;
  label: string;
  /** Narrow-screen label. When set, this link is also a mobile chip. */
  shortLabel?: string;
  /** One-thumb chip. Falls back to shortLabel. */
  chipLabel?: string;
  /** Open in a new tab. Off-site (http) hrefs always open in a new tab. */
  external?: boolean;
  activePaths?: string[];
  /** Match this href only, not nested routes. */
  exact?: boolean;
  /** When set, this decides the current item instead of href matching. */
  isCurrent?: (pathname: string) => boolean;
}

/** Off-site URLs render as plain <a>; internal paths use the locale-aware Link. */
const isExternalHref = (href: string) => /^https?:\/\//.test(href);

function CreateAction({
  action,
  size = 'default',
  onClick,
  className,
}: {
  action: { href: string; label: string };
  size?: 'default' | 'sm';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={action.href}
      onClick={onClick}
      className={cn(
        buttonVariants({ size }),
        'trend-header-create shrink-0',
        className
      )}
    >
      {action.label}
    </Link>
  );
}

function NavText({
  link,
  mode,
}: {
  link: NavLink;
  mode: 'responsive' | 'full';
}) {
  if (mode === 'responsive' && link.shortLabel) {
    return (
      <>
        <span className="xl:hidden">{link.shortLabel}</span>
        <span className="hidden xl:inline">{link.label}</span>
      </>
    );
  }
  return link.label;
}

/** Exact match, or a prefix match for nested routes (`/chat/<id>`). */
function isActiveHref(pathname: string, href: string, exact = false) {
  if (href.includes('#')) return false;
  const path = href.split(/[?#]/)[0];
  if (exact || !path.startsWith('/') || path === '/') return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function SiteHeader({
  navLinks,
  creditBalance,
  creditLabel,
  signInLabel,
  openMenuLabel,
  closeMenuLabel,
  effectsLabel,
  brandMark,
  primaryAction,
  trending,
}: {
  navLinks?: NavLink[];
  creditBalance?: number;
  creditLabel: string;
  signInLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
  /** Accessible name for the mobile effect chips. */
  effectsLabel?: string;
  brandMark?: string;
  primaryAction?: { href: string; label: string };
  /** On-demand effect picker. Separate from the first-visit announce. */
  trending?: TrendingPopupCopy & { button: string; buttonLabel: string };
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trendingOpen, setTrendingOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  useEffect(() => {
    setMobileOpen(false);
    setTrendingOpen(false);
  }, [pathname]);
  function promptSignIn() {
    openAuthPrompt({
      callbackUrl: `${pathname}${window.location.search}${window.location.hash}`,
    });
    setMobileOpen(false);
  }
  const user = session?.user;
  const active = (link: NavLink) =>
    link.isCurrent
      ? link.isCurrent(pathname)
      : isActiveHref(pathname, link.href, link.exact) ||
        link.activePaths?.some((path) => isActiveHref(pathname, path));
  const signInVariant = primaryAction || brandMark ? 'ghost' : 'default';
  const effectChips = navLinks?.filter((link) => link.shortLabel) ?? [];
  const creditLink = user && (
    <Link
      href="/settings/credits"
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
      aria-label={creditLabel}
    >
      <Coins className="size-3.5" />
      <span className="text-foreground font-medium">
        {creditBalance === undefined ? '…' : creditBalance.toLocaleString()}
      </span>
      <span className="hidden xl:inline">{creditLabel}</span>
    </Link>
  );

  return (
    <header
      className={cn(
        'bg-background/80 sticky top-0 z-50 w-full shrink-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur-sm',
        brandMark && 'trend-header'
      )}
    >
      <div className="trend-header-inner mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand + nav, left aligned */}
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2"
            onClick={() => setMobileOpen(false)}
          >
            <img
              src={envConfigs.app_logo}
              alt={envConfigs.app_name}
              width={36}
              height={36}
              className={
                brandMark
                  ? 'size-8 shrink-0 rounded-lg sm:size-9'
                  : 'size-7 shrink-0 rounded-md'
              }
            />
            <span
              aria-hidden="true"
              className={
                brandMark
                  ? 'truncate font-sans text-base font-semibold tracking-tight sm:text-lg'
                  : 'truncate font-serif text-lg italic'
              }
            >
              {envConfigs.app_name}
            </span>
          </Link>

          <nav className="trend-header-nav hidden items-center gap-5 lg:flex">
            {navLinks?.map((link) =>
              isExternalHref(link.href) ? (
                <a
                  key={link.href}
                  href={withUtmSource(link.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  aria-current={active(link) ? 'page' : undefined}
                  className={cn(
                    'text-sm whitespace-nowrap transition-colors',
                    active(link)
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <NavText link={link} mode="responsive" />
                </Link>
              )
            )}
          </nav>
        </div>

        {/* Desktop actions */}
        <div className="trend-header-actions hidden items-center gap-3 lg:flex">
          {creditLink}
          {trending && (
            <TrendingControl
              label={trending.buttonLabel}
              text={trending.button}
              open={trendingOpen}
              onClick={() => setTrendingOpen(true)}
            />
          )}
          <LocaleSelector />
          {!brandMark && <ThemeToggle />}
          {user ? (
            <SiteUserMenu
              name={user.name || 'User'}
              email={user.email}
              image={user.image}
            />
          ) : (
            <button
              type="button"
              onClick={promptSignIn}
              className={cn(
                buttonVariants({ variant: signInVariant }),
                'gap-1.5'
              )}
            >
              {signInLabel}
            </button>
          )}
          {primaryAction && <CreateAction action={primaryAction} />}
        </div>

        {/* Mobile: Create stays in the bar; the drawer holds the other links. */}
        <div className="flex shrink-0 items-center gap-2.5 lg:hidden">
          {trending && (
            <TrendingControl
              compact
              label={trending.buttonLabel}
              text={trending.button}
              open={trendingOpen}
              onClick={() => setTrendingOpen(true)}
            />
          )}
          {primaryAction && (
            <CreateAction
              action={primaryAction}
              className="min-h-11 px-3"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? closeMenuLabel : openMenuLabel}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </button>
        </div>
      </div>

      {effectChips.length > 0 && (
        <EffectChipRow
          label={effectsLabel}
          links={effectChips}
          active={active}
          onNavigate={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="bg-background border-border absolute top-full right-0 left-0 max-h-[calc(100dvh-8rem)] overflow-y-auto border-t px-4 pt-2 pb-4 shadow-lg lg:hidden">
          <nav className="flex flex-col gap-2">
            {trending && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setTrendingOpen(true);
                }}
                className="text-primary hover:bg-accent flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold"
              >
                <Flame className="size-4" aria-hidden="true" />
                {trending.button}
              </button>
            )}
            {navLinks?.map((link) =>
              isExternalHref(link.href) ? (
                <a
                  key={link.href}
                  href={withUtmSource(link.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground flex min-h-11 items-center rounded-md px-3 text-sm transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active(link) ? 'page' : undefined}
                  target={link.external ? '_blank' : undefined}
                  className={cn(
                    'hover:bg-accent hover:text-foreground flex min-h-11 items-center rounded-md px-3 text-sm transition-colors',
                    active(link)
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>
          <div className="border-border mt-3 flex items-center gap-2 border-t pt-3">
            {creditLink}
            <LocaleSelector />
            {!brandMark && <ThemeToggle />}
            <div className="flex-1" />
            {user ? (
              <SiteUserMenu
                name={user.name || 'User'}
                email={user.email}
                image={user.image}
              />
            ) : (
              <button
                type="button"
                onClick={promptSignIn}
                className={cn(
                  buttonVariants({ variant: signInVariant }),
                  'gap-1.5'
                )}
              >
                {signInLabel}
              </button>
            )}
          </div>
        </div>
      )}
      {trending && (
        <TrendingPopup
          open={trendingOpen}
          onOpenChange={setTrendingOpen}
          chip={trending.chip}
          title={trending.title}
          lede={trending.lede}
          closeLabel={trending.closeLabel}
          newLabel={trending.newLabel}
          cards={trending.cards}
        />
      )}
    </header>
  );
}

function EffectChipRow({
  label,
  links,
  active,
  onNavigate,
}: {
  label?: string;
  links: NavLink[];
  active: (link: NavLink) => boolean | undefined;
  onNavigate: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const chipKey = links.map((link) => link.href).join('|');

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const chips = el.querySelectorAll<HTMLElement>('[data-effect-chip]');
      const first = chips[0];
      const last = chips[chips.length - 1];
      if (!first || !last) {
        setEdges({ start: false, end: false });
        return;
      }
      const box = el.getBoundingClientRect();
      const rtl = getComputedStyle(el).direction === 'rtl';
      const firstBox = first.getBoundingClientRect();
      const lastBox = last.getBoundingClientRect();
      const next = rtl
        ? {
            start: firstBox.right > box.right + 1,
            end: lastBox.left < box.left - 1,
          }
        : {
            start: firstBox.left < box.left - 1,
            end: lastBox.right > box.right + 1,
          };
      setEdges((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next
      );
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const chip of el.querySelectorAll<HTMLElement>('[data-effect-chip]')) {
      observer.observe(chip);
    }
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [chipKey]);

  return (
    <nav aria-label={label} className="trend-effect-chips lg:hidden">
      <div
        ref={scrollerRef}
        data-fade-start={edges.start ? 'true' : 'false'}
        data-fade-end={edges.end ? 'true' : 'false'}
        className="trend-effect-chips-scroller"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            data-effect-chip=""
            aria-current={active(link) ? 'page' : undefined}
            className={cn(
              'trend-nav-chip inline-flex h-9 shrink-0 snap-start items-center rounded-full px-3 text-[13px] leading-none whitespace-nowrap',
              active(link)
                ? 'bg-foreground/12 text-foreground ring-foreground/15 font-semibold ring-1'
                : 'text-muted-foreground hover:bg-foreground/8 hover:text-foreground font-medium'
            )}
            onClick={onNavigate}
          >
            {link.chipLabel ?? link.shortLabel}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function TrendingControl({
  label,
  text,
  open,
  compact = false,
  onClick,
}: {
  label: string;
  text: string;
  open: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        'trend-header-trending border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-semibold transition-colors',
        compact
          ? 'min-h-11 min-w-11 px-2.5 text-sm sm:w-auto sm:px-3'
          : 'h-8 px-3 text-[13px]'
      )}
    >
      <Flame className="size-3.5" aria-hidden="true" />
      <span className={compact ? 'max-sm:sr-only' : undefined}>{text}</span>
    </button>
  );
}
