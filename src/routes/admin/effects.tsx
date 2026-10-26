import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';

import { apiGet, apiPut } from '@/lib/api-client';
import {
  EFFECT_BRAND_SLUGS,
  type EffectBrandSlug,
  type EffectRelatedSettings,
} from '@/lib/related-posts';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type EffectsResponse = { effects: EffectRelatedSettings[] };

type Draft = {
  tags: string;
  ids: string;
};

function draftFrom(effect: EffectRelatedSettings): Draft {
  return {
    tags: effect.relatedPostTags.join(', '),
    ids: effect.relatedPostIds.join(', '),
  };
}

function EffectsPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Partial<Record<EffectBrandSlug, Draft>>>(
    {}
  );
  const listQuery = useQuery({
    queryKey: ['admin-effects'],
    queryFn: () => apiGet<EffectsResponse>('/api/admin/effects'),
  });

  useEffect(() => {
    if (!listQuery.data) return;
    const next: Partial<Record<EffectBrandSlug, Draft>> = {};
    for (const effect of listQuery.data.effects) {
      next[effect.slug] = draftFrom(effect);
    }
    setDrafts(next);
  }, [listQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (slug: EffectBrandSlug) => {
      const draft = drafts[slug];
      return apiPut<EffectRelatedSettings>('/api/admin/effects', {
        slug,
        relatedPostTags: draft?.tags ?? '',
        relatedPostIds: draft?.ids ?? '',
      });
    },
    onSuccess: () => {
      toast.success(m['admin.effects.saved']());
      queryClient.invalidateQueries({ queryKey: ['admin-effects'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function update(slug: EffectBrandSlug, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [slug]: {
        tags: current[slug]?.tags ?? '',
        ids: current[slug]?.ids ?? '',
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.effects.title']()}</h1>
        <p className="text-muted-foreground mt-1">
          {m['admin.effects.description']()}
        </p>
      </div>
      {EFFECT_BRAND_SLUGS.map((slug) => {
        const draft = drafts[slug] ?? {
          tags: '',
          ids: '',
        };
        return (
          <form
            key={slug}
            className="space-y-4 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(slug);
            }}
          >
            <h2 className="font-mono text-sm font-semibold">{slug}</h2>
            <div className="space-y-2">
              <Label htmlFor={`${slug}-tags`}>
                {m['admin.effects.tags']()}
              </Label>
              <Textarea
                id={`${slug}-tags`}
                value={draft.tags}
                onChange={(event) => update(slug, { tags: event.target.value })}
                placeholder={slug}
              />
              <p className="text-muted-foreground text-xs">
                {m['admin.effects.tags_hint']()}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${slug}-ids`}>{m['admin.effects.ids']()}</Label>
              <Textarea
                id={`${slug}-ids`}
                value={draft.ids}
                onChange={(event) => update(slug, { ids: event.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                {m['admin.effects.ids_hint']()}
              </p>
            </div>
            <Button type="submit" disabled={saveMutation.isPending}>
              {m['admin.effects.save']()}
            </Button>
          </form>
        );
      })}
    </div>
  );
}

export const Route = createFileRoute('/admin/effects')({
  component: EffectsPage,
});
