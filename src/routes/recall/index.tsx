import { createFileRoute } from '@tanstack/react-router';

import { EmailRecallCheckout } from '@/blocks/email-recall';

export const Route = createFileRoute('/recall/')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: EmailRecallCheckout,
});
