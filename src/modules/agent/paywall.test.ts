import { describe, expect, it } from 'vitest';

import {
  AGENT_MODEL_OPTIONS,
  creditsForGeneration,
} from '@/lib/agent-settings';

import { checkCredits, insufficientCreditsBody } from './paywall';

const priced = AGENT_MODEL_OPTIONS.map((option) => ({
  option,
  cost: creditsForGeneration(option.value, option.defaultDuration),
}));
const cheapest = [...priced].sort((a, b) => a.cost - b.cost)[0];

describe('checkCredits', () => {
  it('allows a turn when the balance covers the selected clip', () => {
    const verdict = checkCredits({
      modelName: cheapest.option.value,
      duration: cheapest.option.defaultDuration,
      balance: cheapest.cost,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.required).toBe(cheapest.cost);
  });

  it('refuses one credit short', () => {
    const verdict = checkCredits({
      modelName: cheapest.option.value,
      duration: cheapest.option.defaultDuration,
      balance: cheapest.cost - 1,
    });
    expect(verdict.allowed).toBe(false);
  });

  it('charges a supported longer clip more', () => {
    const kling = AGENT_MODEL_OPTIONS[0];
    const shortCost = creditsForGeneration(kling.value, 5);
    const verdict = checkCredits({
      modelName: kling.value,
      duration: 10,
      balance: shortCost,
    });
    expect(verdict.required).toBeGreaterThan(shortCost);
    expect(verdict.allowed).toBe(false);
  });

  it('uses the highest rate for an unrecognised model', () => {
    const required = creditsForGeneration('free-please', 5);
    const verdict = checkCredits({
      modelName: 'free-please',
      duration: 5,
      balance: required - 1,
    });
    expect(verdict.required).toBe(required);
    expect(verdict.allowed).toBe(false);
  });

  it('bills missing model and duration instead of rounding to free', () => {
    expect(checkCredits({ balance: 0 }).required).toBeGreaterThan(0);
    expect(
      checkCredits({ modelName: cheapest.option.value, balance: 0 }).required
    ).toBe(cheapest.cost);
  });
});

describe('insufficientCreditsBody', () => {
  it('tells the client which paywall to show', () => {
    const verdict = checkCredits({
      modelName: cheapest.option.value,
      duration: cheapest.option.defaultDuration,
      balance: 0,
    });
    expect(insufficientCreditsBody(verdict, true)).toMatchObject({
      code: 'insufficient_credits',
      required: cheapest.cost,
      balance: 0,
      subscribed: true,
    });
    expect(insufficientCreditsBody(verdict, false).subscribed).toBe(false);
  });
});
