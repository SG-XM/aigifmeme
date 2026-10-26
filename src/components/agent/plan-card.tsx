import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Coins } from 'lucide-react';

import { apiGet } from '@/lib/api-client';
import {
  CREDITS_CHANGED_EVENT,
  notifyCreditsChanged,
} from '@/lib/credits-changed';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { UpgradeDialog } from '@/components/agent/upgrade-dialog';
import { Button } from '@/components/ui/button';

export { CREDITS_CHANGED_EVENT, notifyCreditsChanged };

interface CurrentSubscription {
  planName?: string | null;
  productName?: string | null;
}

/**
 * Plan and credit balance, above the user menu in the sidebar, with the plan
 * catalog one click away.
 */
export function PlanCard() {
  const queryClient = useQueryClient();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    const handler = () =>
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
    window.addEventListener(CREDITS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CREDITS_CHANGED_EVENT, handler);
  }, [queryClient]);

  const subscriptionQuery = useQuery({
    queryKey: ['user-subscription', 'current'],
    queryFn: () =>
      apiGet<CurrentSubscription | null>('/api/user/subscriptions/current'),
  });

  const creditsQuery = useQuery({
    // Same key the credits settings page uses, so the two share a cache entry.
    queryKey: ['user-credits', 'balance'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
  });

  const subscription = subscriptionQuery.data;
  const planName =
    subscription?.planName ||
    subscription?.productName ||
    m['agent.plan.free']();
  const balance = creditsQuery.data?.balance;

  return (
    <div className="border-border bg-sidebar-accent/40 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {planName}
        </p>
        {/* Only the unsubscribed get sold to here. Someone already paying
            manages their plan from the billing page, where the plan they
            hold is marked. */}
        {!subscriptionQuery.isPending && !subscription && (
          <Button
            type="button"
            size="sm"
            onClick={() => setUpgradeOpen(true)}
            className="h-6 shrink-0 rounded-full px-2.5 text-xs"
          >
            {m['agent.plan.upgrade']()}
          </Button>
        )}
      </div>

      {/* New tab, like the sidebar's other settings links, so a running turn
          isn't navigated away from. */}
      <a
        href={localizeHref('/settings/credits')}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground mt-1.5 flex items-center gap-1.5 text-xs transition-colors"
      >
        <Coins className="size-3.5 shrink-0" />
        <span>{m['agent.plan.credits']()}</span>
        <span className="text-foreground ml-auto font-medium">
          {balance === undefined ? '…' : balance.toLocaleString()}
        </span>
        <ChevronRight className="size-3.5 shrink-0" />
      </a>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
