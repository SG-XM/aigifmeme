import { createFileRoute, redirect } from '@tanstack/react-router';

import { DAME_HOMBRO_PATH } from '@/lib/dame-hombro-path';

/** Alias. Campaign pages used to keep a short URL and an `-ai` URL. */
export const Route = createFileRoute('/dame-hombro-ai')({
  beforeLoad: () => {
    throw redirect({
      to: DAME_HOMBRO_PATH,
      replace: true,
      statusCode: 301,
    });
  },
});
