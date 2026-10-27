import { createFileRoute } from '@tanstack/react-router';

import { goneRouteHandlers } from '@/lib/gone-paths';

/** Retired scene index. `src/server.ts` returns the same 410 before routing. */
export const Route = createFileRoute('/ai-video/')({
  server: { handlers: goneRouteHandlers },
});
