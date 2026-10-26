import { createFileRoute } from '@tanstack/react-router';

import { AdminABTests } from '@/blocks/admin-ab-tests';

export const Route = createFileRoute('/admin/ab-tests')({
  component: AdminABTests,
});
