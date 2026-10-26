import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { hasPermission } from '@/modules/rbac/service';
import {
  createTopUpProduct,
  listTopUpProductsForAdmin,
  parseTopUpProductInput,
  updateTopUpProduct,
} from '@/modules/top-up-products/service';
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
    return respData(await listTopUpProductsForAdmin(), noStore);
  } catch {
    return respErr('Unable to load top-up products');
  }
}

async function POST({ request }: { request: Request }) {
  const access = await authorize(request);
  if (access.error) return access.error;
  if (!sameOrigin(request)) return respErr('Invalid origin');

  let input;
  try {
    input = parseTopUpProductInput(await request.json());
  } catch (error) {
    return respErr(error instanceof Error ? error.message : 'Invalid product');
  }

  try {
    await createTopUpProduct(input);
    return respOk(noStore);
  } catch {
    return respErr(
      'Unable to create product; the product ID may already exist'
    );
  }
}

async function PATCH({ request }: { request: Request }) {
  const access = await authorize(request);
  if (access.error) return access.error;
  if (!sameOrigin(request)) return respErr('Invalid origin');

  let input;
  try {
    input = parseTopUpProductInput(await request.json());
  } catch (error) {
    return respErr(error instanceof Error ? error.message : 'Invalid product');
  }

  try {
    const product = await updateTopUpProduct(input);
    if (!product) return respErr('Product not found');
    return respOk(noStore);
  } catch {
    return respErr('Unable to update product');
  }
}

export const Route = createFileRoute('/api/admin/top-up-products')({
  server: { handlers: { GET, POST, PATCH } },
});
