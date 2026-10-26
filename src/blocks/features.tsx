import { ArrowRight, Cpu, Film, Layers, MessageSquare } from 'lucide-react';

import { m } from '@/paraglide/messages.js';

export function Features() {
  const models = [
    m['landing.models.item_1'](),
    m['landing.models.item_2'](),
    m['landing.models.item_3'](),
    m['landing.models.item_4'](),
  ];

  return (
    <section id="features" className="px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Eyebrow + heading */}
        <div className="text-center">
          <p className="text-primary text-xs font-medium tracking-[0.18em] uppercase">
            {m['landing.features.eyebrow']()}
          </p>
          <h2 className="text-foreground mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-[-0.02em] sm:text-4xl lg:text-5xl">
            {m['landing.features.title']()}
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed">
            {m['landing.features.description']()}
          </p>
        </div>

        {/* Two top feature cards */}
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Conversational Editing */}
          <div className="group border-border bg-card relative overflow-hidden rounded-lg border p-7">
            <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-md">
              <MessageSquare className="size-5" />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">
              {m['landing.features.conversational_title']()}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
              {m['landing.features.conversational_description']()}
            </p>

            {/* Mock chat bubbles */}
            <div className="border-border bg-background/60 mt-6 space-y-2 rounded-lg border p-3">
              <div className="bg-primary/10 text-foreground ml-auto inline-block max-w-[85%] rounded-md rounded-tr-sm px-3 py-2 text-xs">
                {m['landing.features.demo_prompt']()}
              </div>
              <div className="bg-secondary text-muted-foreground block max-w-[85%] rounded-md rounded-tl-sm px-3 py-2 text-xs">
                {m['landing.features.demo_reply']()}
              </div>
            </div>
          </div>

          {/* Stills become motion */}
          <div className="group border-border bg-card relative overflow-hidden rounded-lg border p-7">
            <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-md">
              <Layers className="size-5" />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">
              {m['landing.features.canvas_title']()}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
              {m['landing.features.canvas_description']()}
            </p>

            {/* Still → motion */}
            <div className="border-border bg-background/60 mt-6 flex items-center gap-3 rounded-lg border p-4">
              <div className="border-border bg-card text-muted-foreground flex-1 rounded-lg border p-3 text-center text-[10px] font-medium">
                Your photo
              </div>
              <ArrowRight className="text-muted-foreground/60 size-4 shrink-0" />
              <div className="border-border bg-card text-muted-foreground flex-1 rounded-lg border p-3 text-center text-[10px] font-medium">
                Opening frame
              </div>
              <ArrowRight className="text-muted-foreground/60 size-4 shrink-0" />
              <div className="border-primary/40 bg-primary/10 text-primary flex-1 rounded-lg border p-3 text-center text-[10px] font-medium">
                5s clip
              </div>
            </div>
          </div>
        </div>

        {/* Multi-model + Version sub-section */}
        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-border bg-card relative overflow-hidden rounded-lg border p-7">
            <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-md">
              <Cpu className="size-5" />
            </div>
            <p className="text-muted-foreground mt-5 text-xs font-medium tracking-[0.16em] uppercase">
              {m['landing.features.multimodel_eyebrow']()}
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">
              {m['landing.features.multimodel_title']()}
            </h3>
            <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-relaxed">
              {m['landing.features.multimodel_desc']()}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {models.map((name) => (
                <div
                  key={name}
                  className="border-border bg-background/60 text-foreground/80 rounded-md border px-3 py-3 text-center text-xs font-medium"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>

          <div className="border-border bg-card relative overflow-hidden rounded-lg border p-7">
            <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-md">
              <Film className="size-5" />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">
              {m['landing.features.version_title']()}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m['landing.features.version_description']()}
            </p>

            {/* Take history */}
            <ol className="mt-6 space-y-2">
              {[
                'Take 1 · wide',
                'Take 2 · slower push',
                'Take 3 · 9:16',
                'Take 4 · final',
              ].map((label, i) => (
                <li
                  key={label}
                  className="border-border bg-background/60 flex items-center gap-3 rounded-lg border px-3 py-2 text-xs"
                >
                  <span className="bg-primary size-1.5 rounded-full" />
                  <span className="text-muted-foreground">{label}</span>
                  {i === 3 && (
                    <span className="bg-primary/10 text-primary ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium">
                      current
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
