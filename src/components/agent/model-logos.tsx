import { Film } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Catalog models use a neutral video mark. */
export function ModelLogo({
  model: _model,
  className,
}: {
  model: string;
  className?: string;
}) {
  return <Film className={cn('text-foreground', className)} />;
}
