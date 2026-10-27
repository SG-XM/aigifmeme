import { createFileRoute } from '@tanstack/react-router';

import { goneRouteHandlers } from '@/lib/gone-paths';

/** Retired alias. Previously 301'd to /window-peeper. */
export const Route = createFileRoute('/window-peeper-ai')({
  server: { handlers: goneRouteHandlers },
});
