import { createFileRoute } from '@tanstack/react-router';

import { goneRouteHandlers } from '@/lib/gone-paths';

/** Retired campaign. `src/server.ts` returns the same 410 before routing. */
export const Route = createFileRoute('/burning-bridges-ai')({
  server: { handlers: goneRouteHandlers },
});
