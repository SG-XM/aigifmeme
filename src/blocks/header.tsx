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
import { trendingEffects } from '@/lib/trending-effects';
import { m } from '@/paraglide/messages.js';
import { SiteHeader, type NavLink } from '@/components/site-header';

export function Header({
  campaign = 'bulin',
  brandMark,
  nav = 'effects',
  createHref,
}: {
  campaign?: EffectCampaign;
  /** Trend wordmark on campaign landings. Nav links stay the same either way. */
  brandMark?: string;
  /** Homepage hides the other trend chips. Effect pages keep them. */
  nav?: 'effects' | 'uptown';
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
  const navLinks: NavLink[] = uptownNav
    ? [
        { href: '/#usage', label: m['home.nav.how']() },
        { href: '/#beats', label: m['home.nav.beats']() },
        { href: '/pricing', label: m['landing.nav.pricing']() },
        { href: '/#faq', label: m['home.nav.faq']() },
        ...(session?.user
          ? [{ href: '/library', label: m['agent.nav.library']() }]
          : []),
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
        ...(session?.user
          ? [{ href: '/library', label: m['agent.nav.library']() }]
          : []),
      ];

  return (
    <SiteHeader
      navLinks={navLinks}
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
          (uptownNav ? '/#create' : effectHash(campaign, 'create')),
        label: uptownNav ? m['home.nav.create']() : m['landing.nav.create'](),
      }}
      trending={
        uptownNav
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
