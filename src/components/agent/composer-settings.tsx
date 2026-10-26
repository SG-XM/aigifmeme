import { ChevronDown } from 'lucide-react';

import {
  AGENT_RESOLUTIONS,
  aspectRatiosForModel,
  isAutoAspectRatio,
  modelOptionFor,
  resolutionsForModel,
  type AgentComposerSettings,
} from '@/lib/agent-settings';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Draw the ratio as a proportional outline. The glyph sits in a fixed-height
 * box so every tile's label lands on the same baseline.
 */
function RatioGlyph({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const scale = 18 / Math.max(w, h);
  return (
    <span className="flex h-[18px] items-center justify-center">
      <span
        className="block rounded-[3px] border-[1.5px] border-current"
        style={{ width: w * scale, height: h * scale }}
      />
    </span>
  );
}

/**
 * Output settings (duration + resolution + aspect ratio) as a single pill next
 * to the model picker; the label mirrors the current set, e.g. "5s · 720p ·
 * 16:9". Duration leads because it is the one that changes the price.
 */
export function ComposerSettings({
  settings,
  onChange,
  disabled,
}: {
  settings: AgentComposerSettings;
  onChange: (settings: AgentComposerSettings) => void;
  disabled?: boolean;
}) {
  function update(patch: Partial<AgentComposerSettings>) {
    onChange({ ...settings, ...patch });
  }

  const resolutionLabel =
    AGENT_RESOLUTIONS.find((item) => item.value === settings.resolution)
      ?.label ?? settings.resolution;
  const aspectLabel = isAutoAspectRatio(settings.aspectRatio)
    ? m['agent.composer.auto']()
    : settings.aspectRatio;
  const activeModel = modelOptionFor(settings.modelOption)!;
  const resolutions = resolutionsForModel(settings.modelOption);
  const aspectRatios = aspectRatiosForModel(settings.modelOption);
  const durations = activeModel.durations;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="bg-muted/70 text-foreground hover:bg-muted h-9 gap-1.5 rounded-md px-3 text-xs"
          />
        }
      >
        <span className="truncate">
          {m['agent.composer.duration_seconds']({ seconds: settings.duration })}{' '}
          · {resolutionLabel} · {aspectLabel}
        </span>
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[320px] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium">
            {m['agent.composer.duration']()}
          </p>
          <output
            htmlFor="agent-video-duration"
            className="bg-primary/10 text-primary min-w-10 rounded-full px-2 py-1 text-center text-xs font-semibold"
          >
            {m['agent.composer.duration_seconds']({
              seconds: settings.duration,
            })}
          </output>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {durations.map((seconds) => {
            const active = settings.duration === seconds;
            return (
              <button
                key={seconds}
                type="button"
                onClick={() => update({ duration: seconds })}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {m['agent.composer.duration_seconds']({ seconds })}
              </button>
            );
          })}
        </div>
        <p className="mt-4 mb-2 text-xs font-medium">
          {m['agent.composer.resolution']()}
        </p>
        <div className="bg-muted flex rounded-md p-0.5">
          {resolutions.map((value) => {
            const item = AGENT_RESOLUTIONS.find(
              (candidate) => candidate.value === value
            );
            const active = settings.resolution === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => update({ resolution: value })}
                className={cn(
                  'flex-1 rounded-[5px] py-1.5 text-xs transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item?.label ?? value}
              </button>
            );
          })}
        </div>

        <p className="mt-4 mb-2 text-xs font-medium">
          {m['agent.composer.aspect_ratio']()}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {aspectRatios.map((ratio) => {
            const active = settings.aspectRatio === ratio;
            const isAuto = isAutoAspectRatio(ratio);
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => update({ aspectRatio: ratio })}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-[11px] transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {isAuto ? (
                  <span className="text-xs">{m['agent.composer.auto']()}</span>
                ) : (
                  <>
                    <RatioGlyph ratio={ratio} />
                    <span>{ratio}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
