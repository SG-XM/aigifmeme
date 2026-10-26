import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';

export function FAQ() {
  const items = [
    { q: m['landing.faq.q_1'](), a: m['landing.faq.a_1']() },
    { q: m['landing.faq.q_2'](), a: m['landing.faq.a_2']() },
    { q: m['landing.faq.q_3'](), a: m['landing.faq.a_3']() },
    { q: m['landing.faq.q_4'](), a: m['landing.faq.a_4']() },
    { q: m['landing.faq.q_5'](), a: m['landing.faq.a_5']() },
    { q: m['landing.faq.q_6'](), a: m['landing.faq.a_6']() },
    { q: m['landing.faq.q_7'](), a: m['landing.faq.a_7']() },
    { q: m['landing.faq.q_8'](), a: m['landing.faq.a_8']() },
    { q: m['landing.faq.q_9'](), a: m['landing.faq.a_9']() },
    { q: m['landing.faq.q_10'](), a: m['landing.faq.a_10']() },
  ];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-border border-t px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-primary text-xs font-medium tracking-[0.18em] uppercase">
            {m['landing.faq.eyebrow']()}
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            {m['landing.faq.title']()}
          </h2>
        </div>

        <ul className="divide-border border-border bg-card/40 mt-12 divide-y rounded-lg border">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="hover:bg-accent/40 flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
                >
                  <span className="text-foreground text-sm font-medium sm:text-base">
                    {item.q}
                  </span>
                  <span className="border-border text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full border">
                    {isOpen ? (
                      <Minus className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                  </span>
                </button>
                <div
                  className={cn(
                    'text-muted-foreground grid overflow-hidden text-sm leading-relaxed transition-[grid-template-rows] duration-300 ease-out',
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  )}
                >
                  <div className="min-h-0">
                    <p className="px-5 pb-5">{item.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
