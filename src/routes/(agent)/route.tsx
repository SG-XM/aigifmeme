import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AgentLayout } from '@/components/agent/agent-layout';

export const Route = createFileRoute('/(agent)')({
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AgentGroupLayout,
});

function AgentGroupLayout() {
  return (
    <AgentLayout>
      <Outlet />
    </AgentLayout>
  );
}
