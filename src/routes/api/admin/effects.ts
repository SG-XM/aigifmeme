import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import {
  getDbConfigs,
  saveConfigs,
  type ConfigMap,
} from '@/modules/config/service';
import { hasPermission } from '@/modules/rbac/service';
import {
  EFFECT_BRAND_SLUGS,
  effectIdsKey,
  effectRelatedFromConfigs,
  effectTagsKey,
  formatIdList,
  formatTagList,
  isEffectBrandSlug,
  parseIdList,
  parseTagList,
  type EffectBrandSlug,
} from '@/lib/related-posts';
import { respData, respErr } from '@/lib/resp';

const SAFE_ERRORS = new Set(['Unauthorized', 'Forbidden', 'Invalid effect']);

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (SAFE_ERRORS.has(message)) return message;
  console.error('effect admin error', error);
  return 'Internal error';
}

async function checkAdmin(request: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new Error('Unauthorized');
  const isAdmin = await hasPermission(session.user.id, 'admin.*');
  if (!isAdmin) throw new Error('Forbidden');
}

async function GET({ request }: { request: Request }) {
  try {
    await checkAdmin(request);
    const configs = await getDbConfigs(true);
    return respData({
      effects: EFFECT_BRAND_SLUGS.map((slug) =>
        effectRelatedFromConfigs(slug, configs)
      ),
    });
  } catch (error) {
    return respErr(publicError(error));
  }
}

async function PUT({ request }: { request: Request }) {
  try {
    await checkAdmin(request);
    const body = (await request.json()) as {
      slug?: unknown;
      relatedPostTags?: unknown;
      relatedPostIds?: unknown;
    };
    if (typeof body.slug !== 'string' || !isEffectBrandSlug(body.slug)) {
      return respErr('Invalid effect');
    }
    const slug: EffectBrandSlug = body.slug;
    const tags =
      typeof body.relatedPostTags === 'string' ? body.relatedPostTags : '';
    const ids =
      typeof body.relatedPostIds === 'string' ? body.relatedPostIds : '';
    const configs: ConfigMap = {
      [effectTagsKey(slug)]: formatTagList(parseTagList(tags)),
      [effectIdsKey(slug)]: formatIdList(parseIdList(ids)),
    };
    await saveConfigs(configs);
    const fresh = await getDbConfigs(true);
    return respData(effectRelatedFromConfigs(slug, fresh));
  } catch (error) {
    return respErr(publicError(error));
  }
}

export const Route = createFileRoute('/api/admin/effects')({
  server: { handlers: { GET, PUT } },
});
