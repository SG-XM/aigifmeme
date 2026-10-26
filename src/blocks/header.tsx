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
import { liveEffectNav } from '@/lib/live-effect-nav';
import { trendingEffects } from '@/lib/trending-effects';
import { m } from '@/paraglide/messages.js';
import { SiteHeader, type NavLink } from '@/components/site-header';

export function Header({
  campaign = 'bulin',
  brandMark,
}: {
  campaign?: EffectCampaign;
  /** Trend wordmark on campaign landings. Nav links stay the same either way. */
  brandMark?: string;
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

  const navLinks: NavLink[] = [
    ...liveEffectNav().map((effect) => ({
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
        href: effectHash(campaign, 'create'),
        label: m['landing.nav.create'](),
      }}
      trending={{
        button: m['trending.button'](),
        buttonLabel: m['trending.button_label'](),
        chip: m['trending.chip'](),
        title: m['trending.title'](),
        lede: m['trending.lede'](),
        closeLabel: m['announce.effects.close'](),
        newLabel: m['trending.new'](),
        cards: trendingEffects().map((effect) => ({
          ...effect,
          ...trendingCardCopy(effect.id),
        })),
      }}
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
