import { defineTask } from 'nitro/task';

import { runEmailRecall } from '@/lib/email-recall-runner';

export default defineTask({
  meta: { description: 'Send one eligible recall email per account/email' },
  async run() {
    // Cron invocations do not pass through src/server.ts's fetch wrapper.
    const moduleName = 'cloudflare:workers';
    try {
      const { env } = await import(/* @vite-ignore */ moduleName);
      (globalThis as unknown as { __CF_ENV__: unknown }).__CF_ENV__ = env;
    } catch {
      /* Local Node deployment. */
    }
    return { result: await runEmailRecall() };
  },
});
