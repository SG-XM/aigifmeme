import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { readUploadPreview } from '@/modules/gif-pack/service';
import { respErr } from '@/lib/resp';

async function GET({
  request,
  params,
}: {
  request: Request;
  params: { uploadId: string };
}) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const file = await readUploadPreview(session.user.id, params.uploadId);
  if (!file) return respErr('Not found', { status: 404 });
  return new Response(
    file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength
    ) as ArrayBuffer,
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

export const Route = createFileRoute('/api/gif-packs/uploads/$uploadId')({
  server: { handlers: { GET } },
});
