import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { hasPermission } from '@/modules/rbac/service';
import {
  createSubscriptionPlan,
  listSubscriptionPlansForAdmin,
  parseSubscriptionPlanInput,
  updateSubscriptionPlan,
} from '@/modules/subscription-plans/service';
import { respData, respErr, respOk } from '@/lib/resp';

const noStore = {
  headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
};

async function authorize(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return { error: respErr('Unauthorized') };
  if (!(await hasPermission(session.user.id, 'admin.*'))) {
    return { error: respErr('Forbidden') };
  }
  return { userId: session.user.id };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function GET({ request }: { request: Request }) {
  try {
    const access = await authorize(request);
    if (access.error) return access.error;
    return respData(await listSubscriptionPlansForAdmin(), noStore);
  } catch {
    return respErr('Unable to load subscription plans');
  }
}

async function POST({ request }: { request: Request }) {
  const access = await authorize(request);
  if (access.error) return access.error;
  if (!sameOrigin(request)) return respErr('Invalid origin');

  let input;
  try {
    input = parseSubscriptionPlanInput(await request.json());
  } catch (error) {
    return respErr(error instanceof Error ? error.message : 'Invalid plan');
  }

  try {
    await createSubscriptionPlan(input);
    return respOk(noStore);
  } catch {
    return respErr(
      'Unable to create plan; the product ID may already be in use'
    );
  }
}

async function PATCH({ request }: { request: Request }) {
  const access = await authorize(request);
  if (access.error) return access.error;
  if (!sameOrigin(request)) return respErr('Invalid origin');

  let input;
  try {
    input = parseSubscriptionPlanInput(await request.json());
  } catch (error) {
    return respErr(error instanceof Error ? error.message : 'Invalid plan');
  }

  try {
    const plan = await updateSubscriptionPlan(input);
    if (!plan) return respErr('Plan not found');
    return respOk(noStore);
  } catch {
    return respErr('Unable to update plan');
  }
}

export const Route = createFileRoute('/api/admin/subscription-plans')({
  server: { handlers: { GET, POST, PATCH } },
});
