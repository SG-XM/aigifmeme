import { Suspense, useEffect, useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { SupportWidgetDialog } from '@/blocks/support-widget-dialog';

/**
 * Floating support button (bottom-right) that opens a quick ticket form.
 * Drop into any page or layout: <SupportWidget />
 *
 * Requires login — unauthenticated users get a sign-in prompt instead.
 */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  return (
    <>
      <button
        aria-label={m['common.support.open_label']()}
        onClick={() => setOpen(true)}
        className={cn(
          'fixed right-6 bottom-6 z-50 size-12 rounded-full',
          'bg-primary text-primary-foreground shadow-lg',
          'flex items-center justify-center',
          'transition-all hover:scale-105 hover:shadow-xl'
        )}
      >
        {open ? <X className="size-5" /> : <LifeBuoy className="size-5" />}
      </button>

      {mounted ? (
        <Suspense fallback={null}>
          <SupportWidgetDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
