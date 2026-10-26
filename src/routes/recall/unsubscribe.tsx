import { createFileRoute } from '@tanstack/react-router';

import { EmailRecallUnsubscribe } from '@/blocks/email-recall';

export const Route = createFileRoute('/recall/unsubscribe')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: EmailRecallUnsubscribe,
});
