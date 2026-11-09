import { useEffect, useState } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import {
  BarChart3,
  Coins,
  CreditCard,
  FolderOpen,
  Home,
  LayoutDashboard,
  MousePointerClick,
  Repeat2,
  Settings,
  Shield,
} from 'lucide-react';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { AppLayout } from '@/components/app-layout';

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const group = m['common.systems.admin']();
  const navItems = [
    {
      href: '/admin',
      label: m['admin.nav.overview'](),
      icon: LayoutDashboard,
      group,
    },
    {
      href: '/admin/traffic-sources',
      label: m['admin.nav.traffic_sources'](),
      icon: MousePointerClick,
      group,
    },
    {
      href: '/admin/funnel',
      label: m['admin.nav.funnel'](),
      icon: BarChart3,
      group,
    },
    {
      href: '/admin/users',
      label: m['admin.nav.rbac'](),
      icon: Shield,
      group,
      items: [
        { href: '/admin/users', label: m['admin.nav.users']() },
        { href: '/admin/invite-codes', label: m['admin.nav.invite_codes']() },
        { href: '/admin/roles', label: m['admin.nav.roles']() },
        { href: '/admin/permissions', label: m['admin.nav.permissions']() },
      ],
    },
    {
      href: '/admin/payments',
      label: m['admin.nav.billing'](),
      icon: CreditCard,
      group,
      items: [
        { href: '/admin/payments', label: m['admin.nav.payments']() },
        { href: '/admin/ab-tests', label: m['admin.nav.ab_tests']() },
        { href: '/admin/subscriptions', label: m['admin.nav.subscriptions']() },
        { href: '/admin/credits', label: m['admin.nav.credits']() },
        {
          href: '/admin/credit-redeem-codes',
          label: m['admin.nav.credit_redeem_codes'](),
        },
        {
          href: '/admin/top-up-products',
          label: m['admin.nav.top_up_products'](),
          icon: Coins,
        },
        {
          href: '/admin/subscription-plans',
          label: m['admin.nav.subscription_plans'](),
          icon: Repeat2,
        },
      ],
    },
    {
      href: '/admin/categories',
      label: m['admin.nav.content'](),
      icon: FolderOpen,
      group,
      items: [
        { href: '/admin/categories', label: m['admin.nav.categories']() },
        { href: '/admin/posts', label: m['admin.nav.posts']() },
        { href: '/admin/gif-packs', label: m['admin.nav.gif_packs']() },
        { href: '/admin/tickets', label: m['admin.nav.tickets']() },
      ],
    },
  ];

  const footerNavItems = [
    {
      href: '/admin/settings',
      label: m['admin.nav.settings'](),
      icon: Settings,
    },
    { href: '/', label: m['common.systems.home'](), icon: Home, newTab: true },
  ];

  return (
    <AppLayout
      navItems={navItems}
      footerNavItems={footerNavItems}
      brand={envConfigs.app_name}
      brandHref="/admin"
      profileHref="/settings/profile"
      requirePermission="admin.*"
      headerExtra={<AdminTimezone />}
    >
      <Outlet />
    </AppLayout>
  );
}

function AdminTimezone() {
  const [label, setLabel] = useState('');

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const offset = new Intl.DateTimeFormat('en', {
      timeZone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', 'UTC');

    setLabel([timeZone, offset].filter(Boolean).join(' · '));
  }, []);

  return (
    <span
      aria-label={m['admin.timezone.label']()}
      className="text-muted-foreground text-xs"
      title={m['admin.timezone.label']()}
    >
      {label || m['admin.timezone.loading']()}
    </span>
  );
}
