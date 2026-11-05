import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import {
  effectHash,
  type EffectCampaign,
  type LiveEffectId,
} from '@/lib/ai-video-paths';
import { apiGet } from '@/lib/api-client';
import { CREDITS_CHANGED_EVENT } from '@/lib/credits-changed';
import { isGonePath } from '@/lib/gone-paths';
import { liveEffectNav } from '@/lib/live-effect-nav';
import { isHiddenPublicPath } from '@/lib/public-page-visibility';
import { trendingEffects } from '@/lib/trending-effects';
import { m } from '@/paraglide/messages.js';
import { SiteHeader, type NavLink } from '@/components/site-header';

export function Header({
  campaign = 'bulin',
  brandMark,
  nav = 'product',
  createHref,
}: {
  campaign?: EffectCampaign;
  /** Trend wordmark on campaign landings. Nav links stay the same either way. */
  brandMark?: string;
  /** Product nav is the AIGifMeme default. Effect pages opt into chips. */
  nav?: 'effects' | 'uptown' | 'product';
  /** Overrides the Create button. Homepage and effect pages keep their own. */
  createHref?: string;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const credits = useQuery({
    queryKey: ['user-credits', 'balance'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
    enabled: !!session?.user,
  });
  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: ['user-credits'] });
    window.addEventListener(CREDITS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CREDITS_CHANGED_EVENT, refresh);
  }, [queryClient]);

  const uptownNav = nav === 'uptown';
  const productNav = nav === 'product';
  const navLinks: NavLink[] = productNav
    ? [
        { href: '/#examples', label: m['home.nav.check']() },
        { href: '/#styles', label: m['home.nav.formats']() },
        { href: '/#how', label: m['home.nav.how']() },
        { href: '/pricing', label: m['landing.nav.pricing']() },
        { href: '/#faq', label: m['home.nav.faq']() },
      ]
    : uptownNav
      ? [
          { href: '/#usage', label: m['home.nav.how']() },
          { href: '/#beats', label: m['home.nav.beats']() },
          { href: '/pricing', label: m['landing.nav.pricing']() },
          { href: '/#faq', label: m['home.nav.faq']() },
        ]
      : [
          ...liveEffectNav()
            .filter((effect) => !isGonePath(effect.href))
            .map((effect) => ({
              href: effect.href,
              label: effect.title,
              shortLabel: effect.shortTitle,
              chipLabel: effect.chipLabel,
              isCurrent: effect.isCurrent,
            })),
          {
            href: '/pricing',
            label: m['landing.nav.pricing'](),
          },
        ];

  return (
    <SiteHeader
      navLinks={navLinks.filter((link) => !isHiddenPublicPath(link.href))}
      creditBalance={credits.data?.balance}
      creditLabel={m['agent.plan.credits']()}
      signInLabel={m['common.nav.sign_in']()}
      openMenuLabel={m['navigation.open_menu']()}
      closeMenuLabel={m['navigation.close_menu']()}
      effectsLabel={m['landing.nav.effects']()}
      brandMark={brandMark}
      primaryAction={{
        href:
          createHref ??
          (productNav
            ? '/#create'
            : uptownNav
              ? '/#create'
              : effectHash(campaign, 'create')),
        label: productNav
          ? m['home.nav.start']()
          : uptownNav
            ? m['home.nav.create']()
            : m['landing.nav.create'](),
      }}
      trending={
        uptownNav || productNav
          ? undefined
          : {
              button: m['trending.button'](),
              buttonLabel: m['trending.button_label'](),
              chip: m['trending.chip'](),
              title: m['trending.title'](),
              lede: m['trending.lede'](),
              closeLabel: m['announce.effects.close'](),
              newLabel: m['trending.new'](),
              cards: trendingEffects()
                .filter((effect) => !isGonePath(effect.href))
                .map((effect) => ({
                  ...effect,
                  ...trendingCardCopy(effect.id),
                })),
            }
      }
    />
  );
}

function trendingCardCopy(id: LiveEffectId) {
  if (id === 'sorry') {
    return {
      name: m['sorry.shortNav'](),
      hook: m['trending.sorry.hook'](),
      cta: m['trending.sorry.cta'](),
    };
  }
  if (id === 'peeper') {
    return {
      name: m['trend.peeper.title'](),
      hook: m['trending.peeper.hook'](),
      cta: m['trending.peeper.cta'](),
    };
  }
  if (id === 'bridges') {
    return {
      name: m['trend.bridges.title'](),
      hook: m['trending.bridges.hook'](),
      cta: m['trending.bridges.cta'](),
    };
  }
  return {
    name: m['trend.bulin.title'](),
    hook: m['trending.bulin.hook'](),
    cta: m['trending.bulin.cta'](),
  };
}
