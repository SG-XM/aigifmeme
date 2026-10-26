import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests only — no Vite app plugins, so a test run doesn't drag in
// paraglide compilation or the nitro build. The `@/` alias has to be
// restated here for the same reason.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
