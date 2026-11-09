import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import {
  apiDelete,
  ApiError,
  apiGet,
  apiPost,
  apiUpload,
} from '@/lib/api-client';
import {
  GIF_PACK_BACKGROUNDS,
  GIF_PACK_DEFAULT_BACKGROUND,
  GIF_PACK_DEFAULT_MOTION,
  GIF_PACK_DEFAULT_STYLE,
  GIF_PACK_LANGUAGES,
  GIF_PACK_USER_REGENS,
  gifPackLanguageForLocale,
  type GifPackBackground,
  type GifPackLanguage,
  type GifPackMotion,
  type GifPackStyle,
} from '@/lib/gif-pack/options';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';

type Theme = {
  id: string;
  nameEn: string;
  nameZh: string;
  backgroundColor: string;
};

type Sticker = {
  id: string;
  index: number;
  caption: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  gifFileId: string | null;
};

type Pack = {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  userRegensRemaining: number;
  style: string;
  motionMode: string;
  background: string;
  language: string;
  stickers: Sticker[];
  zipFileId: string | null;
};

const styles: { id: GifPackStyle; label: () => string }[] = [
  { id: 'original', label: () => m['gifpack.style_original']() },
  { id: 'q-cartoon', label: () => m['gifpack.style_q']() },
  { id: 'anime', label: () => m['gifpack.style_anime']() },
  { id: 'cute-3d', label: () => m['gifpack.style_3d']() },
  { id: 'doodle', label: () => m['gifpack.style_doodle']() },
  { id: 'pixel', label: () => m['gifpack.style_pixel']() },
  { id: 'clay', label: () => m['gifpack.style_clay']() },
  { id: 'felt', label: () => m['gifpack.style_felt']() },
];

const motions: { id: GifPackMotion; label: () => string }[] = [
  { id: 'medium', label: () => m['gifpack.motion_medium']() },
  { id: 'large', label: () => m['gifpack.motion_large']() },
  { id: 'fast', label: () => m['gifpack.motion_fast']() },
];

export function GifPackStudio({ packId }: { packId?: string }) {
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const locale = getLocale();
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [themeId, setThemeId] = useState('');
  const [style, setStyle] = useState<GifPackStyle>(GIF_PACK_DEFAULT_STYLE);
  const [motionMode, setMotionMode] = useState<GifPackMotion>(
    GIF_PACK_DEFAULT_MOTION
  );
  const [background, setBackground] = useState<GifPackBackground>(
    GIF_PACK_DEFAULT_BACKGROUND
  );
  const [language, setLanguage] = useState<GifPackLanguage>(
    gifPackLanguageForLocale(locale)
  );
  const [idempotencyKey] = useState(() =>
    crypto.randomUUID().replaceAll('-', '')
  );
  const queryClient = useQueryClient();

  const themes = useQuery({
    queryKey: ['gif-pack-themes'],
    enabled: signedIn && !packId,
    queryFn: () => apiGet<Theme[]>('/api/gif-packs/themes'),
  });

  return (
    <div className="meme-site min-h-screen">
      <Header nav="product" brandMark="aigifmeme" createHref="/packs" />
      <main className="meme-studio">
        <p className="meme-kicker">{m['gifpack.kicker']()}</p>
        <h1>{m['gifpack.title']()}</h1>
        <p className="meme-lede">{m['gifpack.lede']()}</p>
        {mounted && !isPending && !signedIn ? (
          <p>
            <Link
              className="meme-cta"
              href={`/sign-in?callbackUrl=${packId ? `/packs/${packId}` : '/packs'}`}
            >
              {m['gifpack.sign_in']()}
            </Link>
          </p>
        ) : null}
        {mounted && signedIn && !packId ? (
          <Creator
            uploadId={uploadId}
            setUploadId={setUploadId}
            themeId={themeId}
            setThemeId={setThemeId}
            themes={themes.data}
            themesError={
              themes.error instanceof Error ? themes.error.message : null
            }
            style={style}
            setStyle={setStyle}
            motionMode={motionMode}
            setMotionMode={setMotionMode}
            background={background}
            setBackground={setBackground}
            language={language}
            setLanguage={setLanguage}
            idempotencyKey={idempotencyKey}
          />
        ) : null}
        {mounted && signedIn && packId ? <PackView packId={packId} /> : null}
        {mounted && signedIn && !packId ? (
          <History
            onOpen={() =>
              queryClient.invalidateQueries({ queryKey: ['gif-packs'] })
            }
          />
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function Creator(props: {
  uploadId: string | null;
  setUploadId: (id: string | null) => void;
  themeId: string;
  setThemeId: (id: string) => void;
  themes?: Theme[];
  themesError: string | null;
  style: GifPackStyle;
  setStyle: (style: GifPackStyle) => void;
  motionMode: GifPackMotion;
  setMotionMode: (motion: GifPackMotion) => void;
  background: GifPackBackground;
  setBackground: (background: GifPackBackground) => void;
  language: GifPackLanguage;
  setLanguage: (language: GifPackLanguage) => void;
  idempotencyKey: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set('image', file);
      return apiUpload<{ uploadId: string }>('/api/gif-packs/uploads', body);
    },
    onSuccess: (result) => {
      props.setUploadId(result.uploadId);
      setError(null);
    },
    onError: (reason: Error) => {
      props.setUploadId(null);
      setError(reason.message);
    },
  });
  const create = useMutation({
    mutationFn: () =>
      apiPost<Pack>('/api/gif-packs', {
        uploadId: props.uploadId,
        themeId: props.themeId,
        style: props.style,
        motionMode: props.motionMode,
        background: props.background,
        language: props.language,
        idempotencyKey: props.idempotencyKey,
      }),
    onSuccess: (pack) => setCreatedId(pack.id),
    onError: (reason: Error) => setError(reason.message),
  });
  useEffect(() => {
    if (!props.themeId && props.themes?.[0])
      props.setThemeId(props.themes[0].id);
  }, [props.themeId, props.themes, props.setThemeId]);

  if (createdId) {
    return (
      <p>
        <Link className="meme-cta" href={`/packs/${createdId}`}>
          {m['gifpack.open_pack']()}
        </Link>
      </p>
    );
  }

  return (
    <form
      className="meme-studio-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!props.uploadId || !props.themeId || create.isPending) return;
        setError(null);
        create.mutate();
      }}
    >
      <section>
        <h2>1. {m['gifpack.step_upload']()}</h2>
        <label className="meme-file">
          {m['gifpack.upload']()}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
        {props.uploadId ? (
          <img
            alt={m['gifpack.subject_ready']()}
            src={`/api/gif-packs/uploads/${props.uploadId}`}
          />
        ) : null}
        <p>{m['gifpack.no_crop']()}</p>
      </section>
      <section>
        <h2>2. {m['gifpack.step_options']()}</h2>
        <label>
          {m['gifpack.theme']()}
          <select
            value={props.themeId}
            onChange={(event) => props.setThemeId(event.target.value)}
          >
            {(props.themes ?? []).map((theme) => (
              <option key={theme.id} value={theme.id}>
                {props.language === 'zh' ? theme.nameZh : theme.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m['gifpack.style']()}
          <select
            value={props.style}
            onChange={(event) =>
              props.setStyle(event.target.value as GifPackStyle)
            }
          >
            {styles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label()}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m['gifpack.motion']()}
          <select
            value={props.motionMode}
            onChange={(event) =>
              props.setMotionMode(event.target.value as GifPackMotion)
            }
          >
            {motions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label()}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m['gifpack.background']()}
          <select
            value={props.background}
            onChange={(event) =>
              props.setBackground(event.target.value as GifPackBackground)
            }
          >
            {GIF_PACK_BACKGROUNDS.map((item) => (
              <option key={item} value={item}>
                {item === 'transparent'
                  ? m['gifpack.transparent']()
                  : m['gifpack.theme_bg']()}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m['gifpack.language']()}
          <select
            value={props.language}
            onChange={(event) =>
              props.setLanguage(event.target.value as GifPackLanguage)
            }
          >
            {GIF_PACK_LANGUAGES.map((item) => (
              <option key={item} value={item}>
                {item === 'zh'
                  ? m['gifpack.lang_zh']()
                  : m['gifpack.lang_en']()}
              </option>
            ))}
          </select>
        </label>
        <p>{m['gifpack.fast_note']()}</p>
        <p>{m['gifpack.quota']({ count: GIF_PACK_USER_REGENS })}</p>
        <button
          className="meme-cta"
          type="submit"
          disabled={!props.uploadId || create.isPending}
        >
          {m['gifpack.generate']()}
        </button>
      </section>
      {error || props.themesError ? (
        <p role="alert">{error || props.themesError}</p>
      ) : null}
      {upload.isPending ? <p>{m['gifpack.reading']()}</p> : null}
    </form>
  );
}

function PackView({ packId }: { packId: string }) {
  const queryClient = useQueryClient();
  const pack = useQuery({
    queryKey: ['gif-pack', packId],
    queryFn: () => apiGet<Pack>(`/api/gif-packs/${packId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 4000 : false;
    },
  });
  const regen = useMutation({
    mutationFn: (stickerId: string) =>
      apiPost<Pack>(`/api/gif-packs/${packId}/stickers/${stickerId}`, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['gif-pack', packId] }),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/gif-packs/${packId}`),
    onSuccess: () => {
      window.location.href = '/packs';
    },
  });
  const data = pack.data;
  const busy = data?.status === 'queued' || data?.status === 'running';
  return (
    <section>
      <h2>3. {m['gifpack.step_preview']()}</h2>
      {pack.error ? <p role="alert">{(pack.error as Error).message}</p> : null}
      {data?.errorMessage ? <p role="alert">{data.errorMessage}</p> : null}
      <p>
        {data
          ? m['gifpack.regens']({ count: data.userRegensRemaining })
          : m['gifpack.loading']()}
      </p>
      <ul className="meme-pack-grid">
        {(data?.stickers ?? []).map((sticker) => (
          <li key={sticker.id}>
            {sticker.gifFileId ? (
              <img
                alt={sticker.caption}
                src={`/api/gif-packs/${packId}/files/${sticker.gifFileId}`}
              />
            ) : (
              <div className="meme-pack-pending">{sticker.status}</div>
            )}
            <strong>{sticker.caption}</strong>
            {sticker.errorMessage ? <p>{sticker.errorMessage}</p> : null}
            {sticker.gifFileId ? (
              <a
                href={`/api/gif-packs/${packId}/files/${sticker.gifFileId}?download=1`}
              >
                {m['gifpack.download']()}
              </a>
            ) : null}
            <button
              type="button"
              disabled={
                busy || !data || data.userRegensRemaining < 1 || regen.isPending
              }
              onClick={() => regen.mutate(sticker.id)}
            >
              {m['gifpack.regenerate']()}
            </button>
          </li>
        ))}
      </ul>
      {data?.zipFileId ? (
        <a
          className="meme-cta"
          href={`/api/gif-packs/${packId}/files/${data.zipFileId}?download=1`}
        >
          {m['gifpack.download_zip']()}
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
      >
        {m['gifpack.delete']()}
      </button>
      {regen.error instanceof ApiError ? (
        <p role="alert">{regen.error.message}</p>
      ) : null}
    </section>
  );
}

function History({ onOpen }: { onOpen: () => void }) {
  const packs = useQuery({
    queryKey: ['gif-packs'],
    queryFn: () => apiGet<Pack[]>('/api/gif-packs'),
  });
  const items = packs.data ?? [];
  const label = useMemo(() => m['gifpack.history'](), []);
  if (!items.length) return null;
  return (
    <section>
      <h2>{label}</h2>
      <ul>
        {items.map((pack) => (
          <li key={pack.id}>
            <Link href={`/packs/${pack.id}`} onClick={onOpen}>
              {pack.status} · {pack.language}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
