import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { GifPackStudio } from '@/blocks/gif-pack-studio';

export const Route = createFileRoute('/packs/')({
  loader: () => {
    const locale = getLocale();
    return { title: m['gifpack.title']({}, { locale }) };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: loaderData.title }, { name: 'robots', content: 'noindex' }]
      : [],
  }),
  component: () => <GifPackStudio />,
});
