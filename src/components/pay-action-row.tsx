import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Primary checkout action, then Apple Pay on the same row.
 * Every in-flow child gets flex-1, so the wallet stays out of the row until
 * the shared probe says Apple Pay is available.
 */
export function PayActionRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-wrap items-center gap-2 *:flex-1 *:data-[slot=button]:w-auto *:data-[slot=button]:shrink',
        className
      )}
    >
      {children}
    </div>
  );
}
