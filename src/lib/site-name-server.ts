import { createServerFn } from '@tanstack/react-start';

import { envConfigs } from '@/config';

import { resolveSiteName } from './site-name';

/**
 * Server-only site-name lookup for route loaders. The config service (and
 * drizzle) is imported dynamically so it never reaches the client bundle —
 * same pattern as `getAnalyticsConfigs` in `__root.tsx`.
 */
export const getSiteNameFn = createServerFn().handler(async () => {
  try {
    const { getAllConfigs } = await import('@/modules/config/service');
    const configs = await getAllConfigs();
    return resolveSiteName(configs.app_name, envConfigs.app_name);
  } catch {
    return resolveSiteName(undefined, envConfigs.app_name);
  }
});
