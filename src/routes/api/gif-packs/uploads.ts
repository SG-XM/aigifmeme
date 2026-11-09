import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { GifPackError, saveUpload } from '@/modules/gif-pack/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 800,
    keyPrefix: 'gif-pack-upload',
  });
  if (limited) return limited;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return respErr('Choose an image');
    if (file.size > 8 * 1024 * 1024)
      return respErr('Image must be 8 MB or smaller');
    const saved = await saveUpload(
      session.user.id,
      new Uint8Array(await file.arrayBuffer()),
      file.type
    );
    return respData(saved);
  } catch (error) {
    if (error instanceof GifPackError)
      return respErr(error.message, { status: 400 });
    return respErr('Could not read the image');
  }
}

export const Route = createFileRoute('/api/gif-packs/uploads')({
  server: { handlers: { POST } },
});
