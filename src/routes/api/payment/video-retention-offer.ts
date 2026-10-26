import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import {
  getBalance,
  requireCurrentCreditPricing,
} from '@/modules/credits/service';
import { getGeneratedVideoCount } from '@/modules/social-proof/service';
import {
  getRetentionProduct,
  getVideoRetentionOffer,
  issueVideoRetentionOffer,
} from '@/modules/video-retention-offers/service';
import { isABMutationAllowed } from '@/lib/ab-tests';
import {
  AGENT_MODEL_OPTIONS,
  creditsForGeneration,
  isSelectableModelOption,
} from '@/lib/agent-settings';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';
import { retentionCreateRedirect } from '@/lib/video-retention-offer';

const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

async function withGeneratedCount<T extends object>(data: T) {
  try {
    return { ...data, generatedCount: await getGeneratedVideoCount() };
  } catch (error) {
    console.error('generated video count unavailable', error);
    return data;
  }
}
const inputSchema = z
  .object({
    campaign: z.enum(['bulin', 'bridges', 'peeper']),
    modelOption: z.string(),
    duration: z.number().int(),
    resolution: z.string(),
  })
  .strict();

export async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  try {
    return respData(
      await withGeneratedCount(await getVideoRetentionOffer(session.user.id)),
      noStore
    );
  } catch {
    return respErr('Unable to load offer', noStore);
  }
}

export async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request))
    return respErr('Forbidden', { status: 403 });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'retention-offer',
    extraKey: session.user.id,
  });
  if (limited) return limited;
  try {
    const input = inputSchema.parse(await request.json());
    const model = AGENT_MODEL_OPTIONS.find(
      (model) => model.value === input.modelOption
    );
    if (
      !model ||
      !isSelectableModelOption(model.value) ||
      !(model.durations as readonly number[]).includes(input.duration) ||
      !(model.resolutions as readonly string[]).includes(input.resolution)
    )
      return respErr('Unsupported video settings', noStore);
    await requireCurrentCreditPricing();
    const product = await getRetentionProduct();
    const configs = await getAllConfigs(true);
    // The live offer uses dynamic Stripe prices, without an external product mapping.
    if (!product || configs.stripe_enabled !== 'true')
      return respData(await withGeneratedCount({ offer: null }), noStore);
    const cost = creditsForGeneration(
      input.modelOption,
      input.duration,
      input.resolution
    );
    const balance = await getBalance(session.user.id);
    if (product.credits < cost || balance >= cost)
      return respData(await withGeneratedCount({ offer: null }), noStore);
    return respData(
      await withGeneratedCount(
        await issueVideoRetentionOffer(
          session.user.id,
          retentionCreateRedirect(input.campaign),
          input.campaign
        )
      ),
      noStore
    );
  } catch {
    return respErr('Unable to prepare offer', noStore);
  }
}

export const Route = createFileRoute('/api/payment/video-retention-offer')({
  server: { handlers: { GET, POST } },
});
