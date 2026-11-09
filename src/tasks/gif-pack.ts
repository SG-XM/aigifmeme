import { defineTask } from 'nitro/task';

import { resumeStaleGifPacks } from '@/modules/gif-pack/service';

export default defineTask({
  meta: { description: 'Resume GIF pack jobs whose browser already closed' },
  async run() {
    const moduleName = 'cloudflare:workers';
    try {
      const { env } = await import(/* @vite-ignore */ moduleName);
      (globalThis as unknown as { __CF_ENV__: unknown }).__CF_ENV__ = env;
    } catch {
      /* Local Node deployment. */
    }
    return { result: await resumeStaleGifPacks() };
  },
});
