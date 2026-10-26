import { Check, ChevronDown } from 'lucide-react';

import {
  labelForModelOption,
  SELECTABLE_AGENT_MODEL_OPTIONS,
  settingsForModel,
  type AgentComposerSettings,
} from '@/lib/agent-settings';
import { m } from '@/paraglide/messages.js';
import { ModelLogo } from '@/components/agent/model-logos';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ComposerControls({
  settings,
  onChange,
  disabled,
}: {
  settings: AgentComposerSettings;
  onChange: (settings: AgentComposerSettings) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="bg-muted/70 text-foreground hover:bg-muted h-9 max-w-[210px] gap-1.5 rounded-md px-3 text-xs"
          />
        }
      >
        <ModelLogo model={settings.modelOption} className="size-3.5 shrink-0" />
        <span className="truncate">
          {labelForModelOption(settings.modelOption)}
        </span>
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="text-muted-foreground px-2 py-1.5 text-xs">
          {m['agent.composer.video_models']()}
        </div>
        {SELECTABLE_AGENT_MODEL_OPTIONS.map((model) => (
          <DropdownMenuItem
            key={model.value}
            onClick={() => onChange(settingsForModel(settings, model.value))}
            className="items-center gap-2.5"
          >
            <ModelLogo model={model.value} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm">
              {model.tier} · {model.label}
            </span>
            {settings.modelOption === model.value && (
              <Check className="size-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
