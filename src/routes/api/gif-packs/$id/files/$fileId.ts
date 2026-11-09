import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { readPackFile } from '@/modules/gif-pack/service';
import { hasPermission } from '@/modules/rbac/service';
import { respErr } from '@/lib/resp';

async function GET({
  request,
  params,
}: {
  request: Request;
  params: { id: string; fileId: string };
}) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return respErr('Unauthorized', { status: 401 });
  const admin = await hasPermission(session.user.id, 'admin.*');
  const file = await readPackFile(
    params.id,
    params.fileId,
    session.user.id,
    admin
  );
  if (!file) return respErr('Not found', { status: 404 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(
    file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength
    ) as ArrayBuffer,
    {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${download || file.kind === 'zip' ? 'attachment' : 'inline'}; filename="${file.kind === 'zip' ? 'stickers.zip' : 'sticker.gif'}"`,
      },
    }
  );
}

export const Route = createFileRoute('/api/gif-packs/$id/files/$fileId')({
  server: { handlers: { GET } },
});
