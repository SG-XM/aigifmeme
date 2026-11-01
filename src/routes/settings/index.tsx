import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Coins, TrendingUp } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { apiGet } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Subscription = {
  status: string;
  planName?: string | null;
  productName?: string | null;
};

function DashboardPage() {
  const { data: session } = useSession();

  const { data: creditsData } = useQuery({
    queryKey: ['user-credits'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
  });
  const { data: subscriptionData } = useQuery({
    queryKey: ['user-subscription-current'],
    queryFn: () =>
      apiGet<Subscription | null>('/api/user/subscriptions/current'),
  });
  const credits = creditsData?.balance ?? null;
  const subscription = subscriptionData ?? null;

  const planLabel =
    subscription?.planName ||
    subscription?.productName ||
    m['settings.overview.plan_free']();

  const actions = [
    {
      href: '/settings/billing',
      icon: TrendingUp,
      label: m['settings.overview.action_upgrade'](),
    },
    {
      href: '/settings/credits',
      icon: Coins,
      label: m['settings.nav.credits'](),
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {m['settings.title']()}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {m['settings.welcome']({
            name: session?.user?.name || session?.user?.email || '',
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title={m['settings.overview.plan']()}
          icon={TrendingUp}
          value={planLabel}
          description={m['settings.overview.plan_description']()}
        />
        <StatCard
          title={m['settings.credits.title']()}
          icon={Coins}
          value={credits ?? '—'}
          description={m['settings.credits.description']()}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {m['settings.overview.quick_actions']()}
          </CardTitle>
          <CardDescription>
            {m['settings.overview.quick_actions_description']()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  'border-border hover:border-primary/40 hover:bg-primary/5 group flex items-center gap-3 rounded-lg border p-3 transition-colors'
                )}
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                  <action.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {action.label}
                </span>
                <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  icon: Icon,
  value,
  description,
}: {
  title: string;
  icon: typeof TrendingUp;
  value: string | number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="text-muted-foreground size-4" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/settings/')({
  component: DashboardPage,
});
