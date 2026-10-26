import { describe, expect, it } from 'vitest';

import {
  buildConfigTemplate,
  importableConfigKeys,
  planConfigImport,
} from './config-import';

describe('config import plan', () => {
  it('template lists every settings key with an empty value', () => {
    const template = buildConfigTemplate();
    expect(template.version).toBe(1);
    expect(Object.keys(template.configs)).toEqual(importableConfigKeys());
    expect(Object.values(template.configs).every((v) => v === '')).toBe(true);
    expect(template.configs).toHaveProperty('app_name');
    expect(template.configs).toHaveProperty('stripe_secret_key');
  });

  it('accepts the envelope shape and flat shape', () => {
    expect(
      planConfigImport({ configs: { app_name: 'Dance AI' } }).accepted
    ).toEqual({ app_name: 'Dance AI' });
    expect(planConfigImport({ app_name: 'Dance AI' }).accepted).toEqual({
      app_name: 'Dance AI',
    });
  });

  it('rejects unknown keys and lists them, without touching known keys', () => {
    const plan = planConfigImport({
      app_name: 'Dance AI',
      auth_secret: 'nope',
      orders: 'nope',
    });
    expect(plan.accepted).toEqual({ app_name: 'Dance AI' });
    expect(plan.rejected.map((r) => r.key)).toEqual(['auth_secret', 'orders']);
  });

  it('skips empty and masked values instead of wiping existing config', () => {
    const plan = planConfigImport({
      app_name: '',
      stripe_secret_key: '••••••••1234',
    });
    expect(plan.accepted).toEqual({});
    expect(plan.skipped.map((r) => r.key)).toEqual([
      'app_name',
      'stripe_secret_key',
    ]);
  });

  it('coerces numbers/booleans and rejects objects/arrays/null', () => {
    const plan = planConfigImport({
      initial_credits_amount: 10,
      email_auth_enabled: true,
      app_name: null,
      app_url: ['x'],
    });
    expect(plan.accepted).toEqual({
      initial_credits_amount: '10',
      email_auth_enabled: 'true',
    });
    expect(plan.rejected.map((r) => r.key)).toEqual(['app_name', 'app_url']);
  });

  it('rejects a non-object root', () => {
    expect(planConfigImport('nope').rejected[0].key).toBe('(root)');
    expect(planConfigImport(null).rejected[0].key).toBe('(root)');
  });
});
