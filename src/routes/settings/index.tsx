import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowRight,
  Coins,
  ImageIcon,
  MessagesSquare,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { settingsLibraryCountQueryKey } from '@/lib/agent-library-query';
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
  const { data: libraryData } = useQuery({
    queryKey: settingsLibraryCountQueryKey,
    queryFn: () => apiGet<{ images?: unknown[] }>('/api/agent/library'),
  });
  const { data: chatsData } = useQuery({
    queryKey: ['agent-chats-total'],
    queryFn: () =>
      apiGet<{ total?: number }>('/api/agent/chats?page=1&pageSize=1'),
  });

  const credits = creditsData?.balance ?? null;
  const images = libraryData?.images?.length ?? null;
  const chats = chatsData?.total ?? null;
  const subscription = subscriptionData ?? null;

  const planLabel =
    subscription?.planName ||
    subscription?.productName ||
    m['settings.overview.plan_free']();

  const actions = [
    {
      href: '/chat',
      icon: Sparkles,
      label: m['settings.overview.action_create'](),
    },
    {
      href: '/library',
      icon: ImageIcon,
      label: m['settings.overview.action_library'](),
    },
    {
      href: '/settings/billing',
      icon: TrendingUp,
      label: m['settings.overview.action_upgrade'](),
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <StatCard
          title={m['settings.overview.images']()}
          icon={ImageIcon}
          value={images ?? '—'}
          description={m['settings.overview.images_description']()}
        />
        <StatCard
          title={m['settings.overview.chats']()}
          icon={MessagesSquare}
          value={chats ?? '—'}
          description={m['settings.overview.chats_description']()}
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
          <div className="grid gap-3 sm:grid-cols-3">
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
