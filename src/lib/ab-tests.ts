import { z } from 'zod';

export const abExperimentInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  name: z.string().trim().min(1).max(80),
  scene: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
  productScope: z.enum(['subscription', 'topup', 'any']),
  bPercent: z.number().int().min(1).max(99),
  windowDays: z.number().int().min(1).max(90),
});

export type ABExperimentInput = z.infer<typeof abExperimentInput>;
export type ABVariant = 'A' | 'B';
export const HOME_LOGIN_SCENE = 'home-login-gate';
export const AB_VISITOR_COOKIE = 'ab_home_visitor';
export type ABVisitorEvent =
  | 'exposure'
  | 'photo_selected'
  | 'login_prompt'
  | 'submit';
export interface ABVisitorAssignment extends ABAssignment {
  checkoutParticipantId: string | null;
}
export interface ABAssignment {
  participantId: string;
  experimentId: string;
  scene: string;
  variant: ABVariant;
}

export interface ABGroupStats {
  variant: ABVariant;
  participants: number;
  matureParticipants: number;
  checkoutUsers: number;
  payers: number;
  paidOrders: number;
  maturePayers: number;
  conversionRate: number;
  matureConversionRate: number | null;
  missingAmounts: number;
  visitorFunnel?: {
    photoSelected: number;
    loginPrompts: number;
    submits: number;
    authenticated: number;
    generations: number;
    loginConversionRate: number;
  };
  funnel?: {
    photoSelected: number;
    authenticated: number;
    paywallShown: number;
    checkouts: number;
    payers: number;
  };
  revenue: {
    currency: string;
    amount: number;
    perUser: number;
    averageOrder: number;
  }[];
}

export interface ABExperimentSummary extends ABExperimentInput {
  id: string;
  status: 'draft' | 'running' | 'stopped';
  startedAt: string | null;
  groups: ABGroupStats[];
}

/** Same-origin JSON mutations; also reject explicit cross-site fetches. */
export function isABMutationAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  return (
    request.headers.get('sec-fetch-site') !== 'cross-site' &&
    (!origin || origin === new URL(request.url).origin)
  );
}
