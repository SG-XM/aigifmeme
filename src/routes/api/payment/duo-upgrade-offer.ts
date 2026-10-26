import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { claimDuoUpgradeOffer } from '@/modules/duo-upgrade/service';
import { respData, respErr } from '@/lib/resp';

const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

/** GET returns (and claims) the one post-purchase Duo upgrade showing. */
export async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  try {
    return respData(await claimDuoUpgradeOffer(session.user.id), noStore);
  } catch {
    return respErr('Unable to load offer', noStore);
  }
}

export const Route = createFileRoute('/api/payment/duo-upgrade-offer')({
  server: { handlers: { GET } },
});
