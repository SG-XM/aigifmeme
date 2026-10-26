import { ArrowRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { buttonVariants } from '@/components/ui/button';

export function CTA() {
  return (
    <section className="px-4 py-20 sm:py-28">
      <div className="border-border from-primary/10 via-card to-card relative mx-auto max-w-4xl overflow-hidden rounded-lg border bg-gradient-to-br px-6 py-16 text-center sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-0 h-[400px] bg-[radial-gradient(50%_50%_at_50%_50%,oklch(0.63_0.23_348_/_0.22),transparent_70%)]"
        />
        <div className="relative">
          <h2 className="text-foreground text-3xl font-bold tracking-[-0.02em] sm:text-5xl">
            {m['landing.cta.title']()}
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base sm:text-lg">
            {m['landing.cta.subtitle']()}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'gap-2 rounded-full px-7'
              )}
            >
              {m['landing.cta.primary']()}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#pricing"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'rounded-full px-7'
              )}
            >
              {m['landing.cta.secondary']()}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
