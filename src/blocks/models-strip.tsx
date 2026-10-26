import { m } from '@/paraglide/messages.js';

export function ModelsStrip() {
  const items = [m['landing.models.item_1'](), m['landing.models.item_2']()];

  return (
    <section className="border-border/60 bg-secondary/30 border-y px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-muted-foreground text-center text-xs font-medium tracking-[0.18em] uppercase">
          {m['landing.models.title']()}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {items.map((name) => (
            <span
              key={name}
              className="text-foreground/70 hover:text-foreground text-sm font-medium transition-colors"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
