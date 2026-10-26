import { createFileRoute } from '@tanstack/react-router';

import { AdminFunnel } from '@/blocks/admin-funnel';

export const Route = createFileRoute('/admin/funnel')({
  component: AdminFunnel,
});
