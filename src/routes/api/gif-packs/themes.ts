import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { listThemes } from '@/modules/gif-pack/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  return respData(await listThemes());
}

export const Route = createFileRoute('/api/gif-packs/themes')({
  server: { handlers: { GET } },
});
