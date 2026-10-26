/**
 * Admin config bulk import/export — pure validation, no DB access.
 *
 * The import accepts either an envelope `{ "configs": { ... } }` (the shape
 * the export template uses) or a flat `{ "<key>": "<value>" }` object.
 * Only keys defined in `settings.ts` are importable; anything else is
 * rejected and listed so the admin can fix the file. Empty/blank values are
 * skipped (never wipe an existing value with a template placeholder), and
 * masked values (round-tripped from the settings UI) are skipped as
 * "unchanged". Saving itself goes through `saveConfigs`, which encrypts
 * secret keys at rest and drops protected keys — this module never writes.
 */

import { getSettings } from './settings';

export interface ConfigImportRejection {
  key: string;
  reason: string;
}

export interface ConfigImportPlan {
  /** Values to hand to `saveConfigs` (provided keys only). */
  accepted: Record<string, string>;
  /** Known keys intentionally not written (blank or masked values). */
  skipped: ConfigImportRejection[];
  /** Keys/values that must not be written. */
  rejected: ConfigImportRejection[];
}

const MASK_PREFIX = '••••••••';

export function importableConfigKeys(): string[] {
  return getSettings().map((s) => s.name);
}

/** Template the admin can download/copy, fill in, and re-import. */
export function buildConfigTemplate(): {
  version: 1;
  configs: Record<string, string>;
} {
  const configs: Record<string, string> = {};
  for (const key of importableConfigKeys()) configs[key] = '';
  return { version: 1, configs };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function planConfigImport(input: unknown): ConfigImportPlan {
  const plan: ConfigImportPlan = { accepted: {}, skipped: [], rejected: [] };

  if (!isPlainObject(input)) {
    plan.rejected.push({ key: '(root)', reason: 'Expected a JSON object' });
    return plan;
  }
  const source = isPlainObject(input.configs) ? input.configs : input;
  const known = new Set(importableConfigKeys());

  for (const [key, raw] of Object.entries(source)) {
    if (key === 'version' && source === input.configs) continue;
    if (!known.has(key)) {
      plan.rejected.push({ key, reason: 'Unknown config key' });
      continue;
    }
    if (
      typeof raw !== 'string' &&
      typeof raw !== 'number' &&
      typeof raw !== 'boolean'
    ) {
      plan.rejected.push({
        key,
        reason: 'Value must be a string, number, or boolean',
      });
      continue;
    }
    const value = String(raw);
    if (!value.trim()) {
      plan.skipped.push({ key, reason: 'Empty value — existing value kept' });
      continue;
    }
    if (value.startsWith(MASK_PREFIX)) {
      plan.skipped.push({ key, reason: 'Masked value — unchanged' });
      continue;
    }
    plan.accepted[key] = value;
  }
  return plan;
}
