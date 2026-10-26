import { Check, ChevronDown, Volume2, VolumeX } from 'lucide-react';

import type { AgentComposerSettings, AudioMode } from '@/lib/agent-settings';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const modes: AudioMode[] = ['model', 'silent', 'mute_after'];

export function ComposerAudioMode({
  settings,
  onChange,
  disabled,
}: {
  settings: AgentComposerSettings;
  onChange: (settings: AgentComposerSettings) => void;
  disabled?: boolean;
}) {
  const muted = settings.audioMode !== 'model';
  const currentLabel =
    settings.audioMode === 'silent'
      ? m['agent.composer.audio_mode_silent']()
      : settings.audioMode === 'mute_after'
        ? m['agent.composer.audio_mode_post_mute']()
        : m['agent.composer.audio_mode_model']();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={m['agent.composer.audio_mode']()}
            title={m['agent.composer.audio_mode']()}
            className="bg-muted/70 text-foreground hover:bg-muted h-9 max-w-[150px] gap-1.5 rounded-md px-3 text-xs"
          />
        }
      >
        {muted ? (
          <VolumeX className="size-3.5 shrink-0" />
        ) : (
          <Volume2 className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="text-muted-foreground px-2 py-1.5 text-xs">
          {m['agent.composer.audio_mode']()}
        </div>
        {modes.map((mode) => {
          const label =
            mode === 'silent'
              ? m['agent.composer.audio_mode_silent']()
              : mode === 'mute_after'
                ? m['agent.composer.audio_mode_post_mute']()
                : m['agent.composer.audio_mode_model']();
          const description =
            mode === 'silent'
              ? m['agent.composer.audio_mode_silent_description']()
              : mode === 'mute_after'
                ? m['agent.composer.audio_mode_post_mute_description']()
                : m['agent.composer.audio_mode_model_description']();

          return (
            <DropdownMenuItem
              key={mode}
              onClick={() => onChange({ ...settings, audioMode: mode })}
              className="items-start gap-2.5 py-2"
            >
              {settings.audioMode === mode ? (
                <Check className="mt-0.5 size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-sm">{label}</span>
                <span className="text-muted-foreground block text-xs whitespace-normal">
                  {description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
