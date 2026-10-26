import { startTransition, StrictMode } from 'react';
import { StartClient } from '@tanstack/react-start/client';
import { hydrateRoot } from 'react-dom/client';

import { ensureRest, ensureShell } from '@/core/i18n/message-runtime';
import { isMessagesShellOnlyPath } from '@/core/i18n/shell-path';
import { deLocalizeUrl, getLocale } from '@/paraglide/runtime.js';

async function boot() {
  const locale = getLocale();
  await ensureShell(locale);
  const localized = window.location.pathname;
  const delocalized = deLocalizeUrl(window.location.href).pathname;
  if (
    !isMessagesShellOnlyPath(delocalized) &&
    !isMessagesShellOnlyPath(localized)
  ) {
    await ensureRest(locale);
  }
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>
    );
  });
}

void boot().catch((error) => {
  console.error(error);
});
