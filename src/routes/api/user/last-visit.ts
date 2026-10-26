import { createFileRoute } from '@tanstack/react-router';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { user } from '@/config/db/schema';
import { respErr, respOk } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    const now = new Date();
    const updateBefore = new Date(now.getTime() - 60_000);

    await db()
      .update(user)
      .set({ lastVisitAt: now })
      .where(
        and(
          eq(user.id, session.user.id),
          or(isNull(user.lastVisitAt), lt(user.lastVisitAt, updateBefore))
        )
      );

    return respOk();
  } catch (error) {
    console.error('[user] update last visit failed:', error);
    return respErr('Internal error');
  }
}

export const Route = createFileRoute('/api/user/last-visit')({
  server: {
    handlers: { POST },
  },
});
