import { createFileRoute, redirect } from '@tanstack/react-router';

import { WINDOW_PEEPER_PATH } from '@/lib/ai-video-paths';

export const Route = createFileRoute('/window-peeper-ai')({
  beforeLoad: () => {
    throw redirect({
      to: WINDOW_PEEPER_PATH,
      replace: true,
      statusCode: 301,
    });
  },
});
