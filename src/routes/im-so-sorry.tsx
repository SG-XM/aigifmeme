import { createFileRoute } from '@tanstack/react-router';

import { goneRouteHandlers } from '@/lib/gone-paths';

/** Retired photo trend. `src/server.ts` returns the same 410 before routing. */
export const Route = createFileRoute('/im-so-sorry')({
  server: { handlers: goneRouteHandlers },
});
