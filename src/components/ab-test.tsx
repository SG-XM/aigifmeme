import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import type { ABAssignment } from '@/lib/ab-tests';
import { apiPost } from '@/lib/api-client';

const ABCheckoutContext = createContext<(() => Promise<string | null>) | null>(
  null
);
const noParticipant = async () => null;
/** Resolve before checkout, allowing the first exposure request to finish. */
export const useABCheckoutParticipant = () =>
  useContext(ABCheckoutContext) ?? noParticipant;

/** Same cache key as `ABTest`, so a sibling can read the variant without a second assign. */
export function useABAssignment(scene?: string) {
  const { data: session, isPending: sessionPending } = useSession();
  const userId = session?.user.id;
  const assignment = useQuery({
    queryKey: ['ab-assignment', scene, userId],
    queryFn: () =>
      apiPost<ABAssignment | null>('/api/ab-tests/assign', { scene }),
    enabled: !!scene && !!userId,
    staleTime: 0,
    retry: 1,
    // Don't silently switch a visible UI when the tab regains focus.
    refetchOnWindowFocus: false,
  });
  return { assignment, sessionPending, userId };
}

/** Mount at the actual purchase UI; each scene's A/B designs live in code. */
export function ABTest({
  scene,
  a,
  b,
  fallback,
  loading = null,
}: {
  scene: string;
  a: ReactNode;
  b: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
}) {
  const { assignment, sessionPending, userId } = useABAssignment(scene);
  const participant = assignment.data;
  const exposure = useRef<{ id: string; ready: Promise<boolean> } | null>(null);
  useEffect(() => {
    if (!participant || !userId) return;
    // This effect runs after the assigned UI commits, never on assignment alone.
    const report = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await apiPost('/api/ab-tests/exposure', {
            participantId: participant.participantId,
          });
          return true;
        } catch {
          if (attempt === 0)
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      return false;
    };
    exposure.current = { id: participant.participantId, ready: report() };
  }, [participant?.participantId, userId]);

  if (sessionPending || (userId && assignment.isPending)) return loading;
  const resolveCheckoutId = async () => {
    const current = exposure.current;
    if (!participant || current?.id !== participant.participantId) return null;
    // Analytics failure must not hang checkout. Fast clicks still await exposure.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = await Promise.race([
      current.ready,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 1500);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return ready ? participant.participantId : null;
  };
  return (
    <ABCheckoutContext.Provider value={resolveCheckoutId}>
      {participant ? (participant.variant === 'B' ? b : a) : (fallback ?? a)}
    </ABCheckoutContext.Provider>
  );
}
