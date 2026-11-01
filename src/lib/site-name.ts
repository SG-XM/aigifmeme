/**
 * Site-name resolution shared by blog and trend/landing metadata.
 *
 * The admin Settings value (`app_name` in the DB config) wins so a new site
 * can be renamed without a rebuild; the build-time `VITE_APP_NAME`
 * (`envConfigs.app_name`) is only a fallback, and `FileMeta Wipe` is the last
 * resort. This matches the default-meta behaviour already used for the
 * document title and email sender name (see `__root.tsx` / email recall).
 */
export function resolveSiteName(
  dbAppName: string | null | undefined,
  envAppName: string | null | undefined
): string {
  return dbAppName?.trim() || envAppName?.trim() || 'FileMeta Wipe';
}
