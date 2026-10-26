import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  buildConfigTemplate,
  planConfigImport,
} from '@/modules/config/config-import';
import { saveConfigs } from '@/modules/config/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

const noStore = {
  headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
};

async function requireSettings(request: Request, permission: string) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return (await hasPermission(session.user.id, permission))
    ? session.user
    : null;
}

/** Downloadable/copyable import template: every known key, empty values. */
async function GET({ request }: { request: Request }) {
  try {
    if (!(await requireSettings(request, 'admin.settings.read')))
      return respErr('Forbidden');
    return respData(buildConfigTemplate(), noStore);
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

/**
 * Bulk-import site config from JSON. Only settings.ts keys are accepted;
 * unknown keys are rejected and listed (never written). Accepted values go
 * through saveConfigs, so secrets are encrypted at rest exactly like the
 * settings form, protected keys are dropped there too, and only the
 * provided keys are overwritten (re-running the same import is a no-op in
 * effect). Orders/users are never touched — this writes config rows only.
 */
async function POST({ request }: { request: Request }) {
  try {
    if (!(await requireSettings(request, 'admin.settings.write')))
      return respErr('Forbidden');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respErr('Invalid JSON');
    }

    const plan = planConfigImport(body);
    if (Object.keys(plan.accepted).length > 0) {
      await saveConfigs(plan.accepted);
    }
    return respData(
      {
        saved: Object.keys(plan.accepted),
        skipped: plan.skipped,
        rejected: plan.rejected,
      },
      noStore
    );
  } catch (error: any) {
    return respErr(error.message || 'Internal error');
  }
}

export const Route = createFileRoute('/api/admin/config/import')({
  server: { handlers: { GET, POST } },
});
