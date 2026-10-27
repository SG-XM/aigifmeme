import { createFileRoute } from '@tanstack/react-router';

import { goneRouteHandlers } from '@/lib/gone-paths';

/** Retired alias. Previously 301'd to /window-peeper. */
export const Route = createFileRoute('/ai-video/window-peeper')({
  server: { handlers: goneRouteHandlers },
});
