import type { ComponentProps, ReactNode } from 'react';
import {
  Link as RouterLink,
  useLocation,
  useRouter as useTanStackRouter,
} from '@tanstack/react-router';

import { getLocale, localizeHref } from '@/paraglide/runtime.js';

// Locale-aware navigation. Locale prefixes are handled entirely by the
// router rewrite (Paraglide localizeUrl/deLocalizeUrl) — internal hrefs
// stay locale-free and get localized on output automatically.

export function useCurrentLocale(): string {
  return getLocale();
}

type LinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  href: string;
  locale?: string; // kept for API compat; locale switching goes via setLocale()
  prefetch?: boolean | string;
  children?: ReactNode;
};

export function Link({ href, locale, prefetch, ...rest }: LinkProps) {
  const pathname = usePathname();
  const [to, hash] = href.split('#');
  if (/^(https?:|mailto:|tel:|#)/.test(href)) {
    return <a href={href} {...rest} />;
  }
  // Native same-page anchors scroll again even when the hash is unchanged,
  // without triggering the router's scroll restoration or reloading the form.
  if (hash && to === pathname) {
    return <a href={localizeHref(href)} {...rest} />;
  }
  const Comp = RouterLink as any;
  return (
    <Comp
      to={to}
      hash={hash}
      hashScrollIntoView={{
        behavior:
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        block: 'start',
      }}
      {...rest}
    />
  );
}

export function usePathname(): string {
  // Routes are matched against the de-localized tree, so pathname here is
  // already locale-free.
  return useLocation().pathname;
}

function toNavigateOptions(href: string) {
  const [pathPart, hash] = href.split('#');
  const [pathname, searchStr] = pathPart.split('?');
  return {
    to: pathname || '/',
    search: searchStr
      ? Object.fromEntries(new URLSearchParams(searchStr))
      : undefined,
    hash,
  };
}

export function useRouter() {
  const router = useTanStackRouter();
  return {
    // navigate() goes through the router rewrite so outgoing URLs are
    // localized — do not switch this back to history.push.
    push: (href: string) => {
      router.navigate(toNavigateOptions(href) as any);
    },
    replace: (href: string) => {
      router.navigate({ ...toNavigateOptions(href), replace: true } as any);
    },
    back: () => router.history.back(),
    forward: () => router.history.forward(),
    refresh: () => router.invalidate(),
    prefetch: (_href: string) => {},
  };
}
