/** Infinite library pages. Settings must not write a finite payload under this key. */
export const agentLibraryQueryKey = ['agent-library'] as const;

/**
 * Image count on the settings overview. The `agent-library` prefix lets
 * `invalidateQueries({ queryKey: ['agent-library'] })` refresh it without
 * sharing the infinite-query cache entry.
 */
export const settingsLibraryCountQueryKey = [
  'agent-library',
  'settings-count',
] as const;
