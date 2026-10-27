import { createFileRoute } from '@tanstack/react-router';

import { goneRouteHandlers } from '@/lib/gone-paths';

/** Retired alias. Previously rendered the homepage under this URL. */
export const Route = createFileRoute('/bulin-47-ai')({
  server: { handlers: goneRouteHandlers },
});
