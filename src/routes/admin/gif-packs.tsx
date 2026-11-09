import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { apiGet, apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';

type Theme = {
  id: string;
  slug: string;
  version: number;
  nameEn: string;
  nameZh: string;
  backgroundColor: string;
  motions: { intent: string; captionEn: string; captionZh: string }[];
};

type Demo = {
  id: string;
  referenceId: string;
  themeSlug: string;
  title: string;
  assetStatus: string;
  note: string;
};

type RecordRow = {
  id: string;
  status: string;
  style: string;
  motionMode: string;
  background: string;
  language: string;
  errorCode: string | null;
  stickers: { status: string; gifFileId: string | null }[];
  zipFileId: string | null;
} | null;

export const Route = createFileRoute('/admin/gif-packs')({
  component: AdminGifPacks,
});

function AdminGifPacks() {
  const client = useQueryClient();
  const themes = useQuery({
    queryKey: ['admin-gif-themes'],
    queryFn: () => apiGet<Theme[]>('/api/admin/gif-packs?view=themes'),
  });
  const demos = useQuery({
    queryKey: ['admin-gif-demos'],
    queryFn: () => apiGet<Demo[]>('/api/admin/gif-packs?view=demos'),
  });
  const records = useQuery({
    queryKey: ['admin-gif-records'],
    queryFn: () => apiGet<RecordRow[]>('/api/admin/gif-packs?view=records'),
  });
  const [slug, setSlug] = useState('daily-reply');
  const [nameEn, setNameEn] = useState('Daily replies');
  const [nameZh, setNameZh] = useState('日常回话');
  const [backgroundColor, setBackgroundColor] = useState('#FFF4D8');
  const [motions, setMotions] = useState(() =>
    Array.from({ length: 8 }, () => ({
      intent: '',
      captionEn: '',
      captionZh: '',
    }))
  );
  const publish = useMutation({
    mutationFn: () =>
      apiPost('/api/admin/gif-packs', {
        slug,
        nameEn,
        nameZh,
        backgroundColor,
        motions,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin-gif-themes'] }),
  });

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">{m['admin.nav.gif_packs']()}</h1>
        <p className="text-muted-foreground">
          Versioned themes, private generation records, and the 16-pack catalog.
          Demo binaries are not public.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Themes</h2>
        <ul>
          {(themes.data ?? []).map((theme) => (
            <li key={theme.id}>
              {theme.slug} v{theme.version} · {theme.nameEn} / {theme.nameZh} ·{' '}
              {theme.backgroundColor} · {theme.motions.length} motions
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            publish.mutate();
          }}
        >
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            aria-label="slug"
          />
          <input
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            aria-label="English name"
          />
          <input
            value={nameZh}
            onChange={(event) => setNameZh(event.target.value)}
            aria-label="Chinese name"
          />
          <input
            value={backgroundColor}
            onChange={(event) => setBackgroundColor(event.target.value)}
            aria-label="background"
          />
          {motions.map((motion, index) => (
            <div key={index} className="grid gap-1 md:grid-cols-3">
              <input
                aria-label={`intent ${index + 1}`}
                value={motion.intent}
                onChange={(event) =>
                  setMotions((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, intent: event.target.value }
                        : item
                    )
                  )
                }
              />
              <input
                aria-label={`caption en ${index + 1}`}
                value={motion.captionEn}
                onChange={(event) =>
                  setMotions((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, captionEn: event.target.value }
                        : item
                    )
                  )
                }
              />
              <input
                aria-label={`caption zh ${index + 1}`}
                value={motion.captionZh}
                onChange={(event) =>
                  setMotions((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, captionZh: event.target.value }
                        : item
                    )
                  )
                }
              />
            </div>
          ))}
          <button type="submit" disabled={publish.isPending}>
            Publish new version
          </button>
          {publish.error instanceof Error ? (
            <p>{publish.error.message}</p>
          ) : null}
        </form>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Generated records</h2>
        <ul>
          {(records.data ?? []).filter(Boolean).map((row) => (
            <li key={row!.id}>
              {row!.id} · {row!.status} · {row!.style} · {row!.motionMode} ·{' '}
              {row!.background} · {row!.language} ·{' '}
              {row!.stickers.filter((sticker) => sticker.gifFileId).length}/8
              gifs
              {row!.zipFileId ? ' · zip' : ''}
              {row!.errorCode ? ` · ${row!.errorCode}` : ''}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Private demo catalog</h2>
        <p>
          Test fixtures are labeled in automated tests. These 16 rows are not
          those fixtures and have no public files.
        </p>
        <ul>
          {(demos.data ?? []).map((demo) => (
            <li key={demo.id}>
              {demo.title} · {demo.assetStatus}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
