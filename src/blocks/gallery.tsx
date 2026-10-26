import { ArrowRight, Play } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { buttonVariants } from '@/components/ui/button';

// Logo-colour placeholders standing in for sample clips. Drop real posters
// in when you have them — a still is a fair stand-in for a frame, but don't
// pass one off as a video.
const swatches = [
  'from-rose-200 via-pink-200 to-fuchsia-200',
  'from-pink-200 via-rose-100 to-fuchsia-200',
  'from-zinc-300 via-rose-200 to-pink-200',
  'from-fuchsia-200 via-pink-200 to-rose-200',
  'from-rose-100 via-pink-200 to-fuchsia-300',
  'from-pink-200 via-fuchsia-200 to-violet-200',
  'from-zinc-200 via-rose-100 to-fuchsia-100',
  'from-rose-300 via-pink-200 to-zinc-200',
];

export function Gallery() {
  const items = [
    m['landing.gallery.item_1'](),
    m['landing.gallery.item_2'](),
    m['landing.gallery.item_3'](),
    m['landing.gallery.item_4'](),
    m['landing.gallery.item_5'](),
    m['landing.gallery.item_6'](),
    m['landing.gallery.item_7'](),
    m['landing.gallery.item_8'](),
  ];

  return (
    <section id="gallery" className="px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-primary text-xs font-medium tracking-[0.18em] uppercase">
            {m['landing.gallery.eyebrow']()}
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-[-0.02em] sm:text-4xl lg:text-5xl">
            {m['landing.gallery.title']()}
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base">
            {m['landing.gallery.description']()}
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((prompt, i) => (
            <article
              key={i}
              className="group border-border bg-card overflow-hidden rounded-lg border transition-shadow hover:shadow-lg"
            >
              <div
                className={cn(
                  'relative aspect-video w-full bg-gradient-to-br',
                  swatches[i % swatches.length]
                )}
              >
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur transition-transform group-hover:scale-110">
                    <Play className="size-4 fill-white text-white" />
                  </span>
                </span>
                <span className="bg-background/80 text-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                  5s
                </span>
              </div>
              <div className="p-4">
                <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
                  &ldquo;{prompt}&rdquo;
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/chat"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'gap-2 rounded-full px-6'
            )}
          >
            {m['landing.gallery.view_all']()}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
