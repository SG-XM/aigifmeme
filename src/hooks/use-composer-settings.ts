import { useCallback, useEffect, useState } from 'react';

import {
  defaultComposerSettings,
  isAspectRatioValue,
  isAudioMode,
  isDurationValue,
  isResolutionValue,
  isSelectableModelOption,
  settingsForModel,
  type AgentComposerSettings,
} from '@/lib/agent-settings';

const STORAGE_KEY = 'uptown:composer-settings';

function readStored(): AgentComposerSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AgentComposerSettings>;
    // A hidden or retired model must not resurrect itself in the picker.
    if (!isSelectableModelOption(parsed?.modelOption)) return null;
    const defaults = defaultComposerSettings();
    // Same for an aspect ratio, resolution or duration we no longer offer —
    // otherwise the panel shows nothing selected and we keep sending a dead
    // value. Duration matters most: it is what the render is priced on.
    const candidate = {
      ...defaults,
      ...parsed,
      aspectRatio: isAspectRatioValue(parsed.aspectRatio)
        ? parsed.aspectRatio
        : defaults.aspectRatio,
      resolution: isResolutionValue(parsed.resolution)
        ? parsed.resolution
        : defaults.resolution,
      duration: isDurationValue(parsed.duration)
        ? parsed.duration
        : defaults.duration,
      audioMode: isAudioMode(parsed.audioMode)
        ? parsed.audioMode
        : defaults.audioMode,
    } as AgentComposerSettings;
    return settingsForModel(candidate, candidate.modelOption);
  } catch {
    return null;
  }
}

/**
 * Composer settings (model, aspect ratio, resolution, duration) that outlive
 * a reload.
 *
 * Starts from the defaults so server and client render the same markup, then
 * swaps in the stored choice right after mount.
 */
export function useComposerSettings(): [
  AgentComposerSettings,
  (settings: AgentComposerSettings) => void,
] {
  const [settings, setSettings] = useState<AgentComposerSettings>(
    defaultComposerSettings
  );

  useEffect(() => {
    const stored = readStored();
    if (stored) setSettings(stored);
  }, []);

  const update = useCallback((next: AgentComposerSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode, quota) — the choice just won't stick
    }
  }, []);

  return [settings, update];
}
