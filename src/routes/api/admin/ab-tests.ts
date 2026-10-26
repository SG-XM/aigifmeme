import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import {
  createExperiment,
  getExperimentStats,
  listExperiments,
  transitionExperiment,
} from '@/modules/ab-tests/service';
import { hasPermission } from '@/modules/rbac/service';
import { abExperimentInput, isABMutationAllowed } from '@/lib/ab-tests';
import { respData, respErr, respOk } from '@/lib/resp';

async function authorize(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return !!session?.user && (await hasPermission(session.user.id, 'admin.*'));
}
async function GET({ request }: { request: Request }) {
  if (!(await authorize(request))) return respErr('Forbidden', { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (id && !z.string().uuid().safeParse(id).success)
      return respErr('Invalid experiment', { status: 400 });
    return respData(
      id ? await getExperimentStats(id) : await listExperiments(),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('A/B report failed', error);
    return respErr('Report unavailable', { status: 503 });
  }
}
async function POST({ request }: { request: Request }) {
  if (!isABMutationAllowed(request) || !(await authorize(request)))
    return respErr('Forbidden', { status: 403 });
  const parsed = abExperimentInput.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success)
    return respErr('Invalid experiment fields', { status: 400 });
  try {
    return respData(await createExperiment(parsed.data));
  } catch {
    return respErr('Could not create experiment; check the unique key', {
      status: 409,
    });
  }
}
async function PATCH({ request }: { request: Request }) {
  if (!isABMutationAllowed(request) || !(await authorize(request)))
    return respErr('Forbidden', { status: 403 });
  const parsed = z
    .object({ id: z.string().uuid(), action: z.enum(['start', 'stop']) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respErr('Invalid action', { status: 400 });
  try {
    await transitionExperiment(parsed.data.id, parsed.data.action);
    return respOk();
  } catch {
    return respErr(
      'Transition unavailable; another experiment may already use this scene',
      { status: 409 }
    );
  }
}
export const Route = createFileRoute('/api/admin/ab-tests')({
  server: { handlers: { GET, POST, PATCH } },
});
