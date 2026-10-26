import { creditsForGeneration } from '@/lib/agent-settings';

/**
 * Whether a turn can go ahead, and what to say when it can't.
 *
 * Kept apart from the route so the rule can be exercised directly: the tool
 * call refuses on its own, but only after a full LLM turn has been paid for
 * and the user has watched the agent promise a clip it cannot deliver.
 */
export interface CreditVerdict {
  allowed: boolean;
  required: number;
  balance: number;
}

export function checkCredits(params: {
  modelName?: string;
  /** Clip length in seconds; the catalog owns each model's valid choices. */
  duration?: number;
  /** The shared 12-second model price table owns resolution pricing. */
  resolution?: string;
  balance: number;
}): CreditVerdict {
  const required = creditsForGeneration(
    params.modelName,
    params.duration,
    params.resolution
  );
  return {
    allowed: params.balance >= required,
    required,
    balance: params.balance,
  };
}

/** Preserve the stream contract for older clients; new clients offer packs to everyone. */
export function insufficientCreditsBody(
  verdict: CreditVerdict,
  subscribed: boolean
) {
  return {
    code: 'insufficient_credits' as const,
    message: 'insufficient credits',
    required: verdict.required,
    balance: verdict.balance,
    subscribed,
  };
}
