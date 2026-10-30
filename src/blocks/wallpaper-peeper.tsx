import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { ApiError, apiGet, apiPost, apiUpload } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  isWallpaperPeeperTaskId,
  WALLPAPER_PEEPER_PATH,
  WALLPAPER_PEEPER_POLL_MS,
  WINDOW_PEEPER_TEMPLATE,
  windowPeeperCredits,
  windowPeeperResolutionFor,
  windowPeeperResolutions,
  type WallpaperPeeperTaskView,
  type WindowPeeperAspect,
  type WindowPeeperDuration,
  type WindowPeeperModel,
  type WindowPeeperResolution,
} from '@/lib/wallpaper-peeper';
import { m } from '@/paraglide/messages.js';
import { Button, buttonVariants } from '@/components/ui/button';

const TASK_KEY = 'wallpaper-peeper-task';
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const selectClass =
  'bg-background border-input focus-visible:ring-ring h-12 w-full rounded-lg border px-3 text-base focus-visible:ring-2';

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return m['wallpaper_peeper.failed']();
}

export function WallpaperPeeper() {
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [model, setModel] = useState<WindowPeeperModel>(
    WINDOW_PEEPER_TEMPLATE.defaultModel
  );
  const [resolution, setResolution] = useState<WindowPeeperResolution>(
    WINDOW_PEEPER_TEMPLATE.defaultResolution
  );
  const [duration, setDuration] = useState<WindowPeeperDuration>(
    WINDOW_PEEPER_TEMPLATE.defaultDuration
  );
  const [aspectRatio, setAspectRatio] = useState<WindowPeeperAspect>(
    WINDOW_PEEPER_TEMPLATE.defaultAspectRatio
  );
  const [taskId, setTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const credits = windowPeeperCredits(model, resolution);

  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!signedIn) return;
    const saved = sessionStorage.getItem(TASK_KEY);
    if (saved && isWallpaperPeeperTaskId(saved)) setTaskId(saved);
  }, [signedIn]);

  const taskQuery = useQuery({
    queryKey: ['wallpaper-peeper', taskId],
    enabled: Boolean(taskId),
    queryFn: () =>
      apiGet<WallpaperPeeperTaskView>(
        `/api/wallpaper-peeper/generations/${taskId}`
      ),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === 'success' ||
        status === 'failed' ||
        status === 'canceled'
      ) {
        return false;
      }
      return WALLPAPER_PEEPER_POLL_MS;
    },
  });

  const task = taskQuery.data;
  const video = task?.videos.find((url) => url.startsWith('https://'));
  const inFlight =
    busy || task?.status === 'pending' || task?.status === 'processing';

  function onModel(next: WindowPeeperModel) {
    setModel(next);
    setResolution((current) => windowPeeperResolutionFor(next, current));
  }

  function onFile(next: File | null) {
    setError('');
    if (!next) return;
    if (!IMAGE_TYPES.has(next.type)) {
      setError(m['wallpaper_peeper.bad_type']());
      return;
    }
    if (next.size <= 0 || next.size > MAX_BYTES) {
      setError(m['wallpaper_peeper.too_big']());
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setTaskId(null);
    sessionStorage.removeItem(TASK_KEY);
  }

  function reset() {
    sessionStorage.removeItem(TASK_KEY);
    setFile(null);
    setPreview(null);
    setTaskId(null);
    setError('');
  }

  async function generate() {
    if (!file || busy) return;
    setError('');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('files', file);
      form.append('requirePublic', 'true');
      const uploaded = await apiUpload<{ urls: string[] }>(
        '/api/storage/upload-image',
        form
      );
      const referenceImageUrl = uploaded.urls?.[0];
      if (!referenceImageUrl?.startsWith('https://')) {
        setError(m['wallpaper_peeper.need_https']());
        return;
      }
      const created = await apiPost<WallpaperPeeperTaskView>(
        '/api/wallpaper-peeper/generations',
        {
          referenceImageUrl,
          model,
          resolution,
          duration,
          aspectRatio,
        }
      );
      if (!isWallpaperPeeperTaskId(created.taskId)) {
        setError(m['wallpaper_peeper.failed']());
        return;
      }
      sessionStorage.setItem(TASK_KEY, created.taskId);
      setTaskId(created.taskId);
    } catch (generateError) {
      setError(messageOf(generateError));
    } finally {
      setBusy(false);
    }
  }

  const frameClass = aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]';
  const queryError = taskQuery.error ? messageOf(taskQuery.error) : '';
  const visibleError =
    error ||
    (task?.status === 'failed' || task?.status === 'canceled'
      ? m['wallpaper_peeper.failed']()
      : '') ||
    queryError;

  return (
    <section className="mx-auto w-full max-w-md px-4 py-6 sm:py-10">
      <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
        {m['wallpaper_peeper.kicker']()}
      </p>
      <h1 className="mt-2 font-serif text-4xl leading-none">
        {m['wallpaper_peeper.title']()}
      </h1>
      <p className="text-muted-foreground mt-3 text-base leading-relaxed">
        {m['wallpaper_peeper.lede']()}
      </p>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        {m['wallpaper_peeper.dogfood']()}
      </p>

      {isPending ? (
        <div className="bg-muted mt-6 h-48 animate-pulse rounded-2xl" />
      ) : !signedIn ? (
        <div className="mt-6">
          <Link
            href={`/sign-in?callbackUrl=${encodeURIComponent(WALLPAPER_PEEPER_PATH)}`}
            className={cn(buttonVariants(), 'h-12 w-full text-base')}
          >
            {m['wallpaper_peeper.sign_in']()}
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={inFlight}
              aria-label={
                preview
                  ? m['wallpaper_peeper.replace']()
                  : m['wallpaper_peeper.choose']()
              }
              onClick={() => inputRef.current?.click()}
              className="border-input bg-card focus-visible:ring-ring w-full overflow-hidden rounded-2xl border text-left focus-visible:ring-2 disabled:opacity-60"
            >
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className={`${frameClass} w-full object-cover`}
                />
              ) : (
                <span className="flex min-h-44 flex-col items-center justify-center px-4 py-10 text-center">
                  <span className="text-base font-medium">
                    {m['wallpaper_peeper.choose']()}
                  </span>
                  <span className="text-muted-foreground mt-2 text-sm">
                    {m['wallpaper_peeper.photo_hint']()}
                  </span>
                </span>
              )}
            </button>
            {preview ? (
              <button
                type="button"
                className="text-muted-foreground mt-2 text-sm underline-offset-4 hover:underline"
                disabled={inFlight}
                onClick={() => inputRef.current?.click()}
              >
                {m['wallpaper_peeper.replace']()}
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="block">{m['wallpaper_peeper.model']()}</span>
              <select
                className={selectClass}
                value={model}
                disabled={inFlight}
                onChange={(event) =>
                  onModel(event.target.value as WindowPeeperModel)
                }
              >
                <option value="basic">
                  {m['wallpaper_peeper.model.basic']()}
                </option>
                <option value="pro">{m['wallpaper_peeper.model.pro']()}</option>
                <option value="ultra">
                  {m['wallpaper_peeper.model.ultra']()}
                </option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">
                {m['wallpaper_peeper.resolution']()}
              </span>
              <select
                className={selectClass}
                value={resolution}
                disabled={inFlight}
                onChange={(event) =>
                  setResolution(event.target.value as WindowPeeperResolution)
                }
              >
                {windowPeeperResolutions(model).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">{m['wallpaper_peeper.duration']()}</span>
              <select
                className={selectClass}
                value={String(duration)}
                disabled={inFlight}
                onChange={(event) =>
                  setDuration(
                    Number(event.target.value) as WindowPeeperDuration
                  )
                }
              >
                <option value="12">
                  {m['wallpaper_peeper.seconds']({ count: 12 })}
                </option>
                <option value="15">
                  {m['wallpaper_peeper.seconds']({ count: 15 })}
                </option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">{m['wallpaper_peeper.aspect']()}</span>
              <select
                className={selectClass}
                value={aspectRatio}
                disabled={inFlight}
                onChange={(event) =>
                  setAspectRatio(event.target.value as WindowPeeperAspect)
                }
              >
                <option value="9:16">
                  {m['wallpaper_peeper.aspect.portrait']()}
                </option>
                <option value="16:9">
                  {m['wallpaper_peeper.aspect.landscape']()}
                </option>
                <option value="adaptive">
                  {m['wallpaper_peeper.aspect.adaptive']()}
                </option>
              </select>
            </label>
          </div>

          {credits != null ? (
            <p className="text-muted-foreground text-sm">
              {m['wallpaper_peeper.credits']({ count: credits })}
            </p>
          ) : null}

          {inFlight ? (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {busy
                ? m['wallpaper_peeper.uploading']()
                : m['wallpaper_peeper.working']()}
            </p>
          ) : null}

          {visibleError ? (
            <p className="text-destructive text-sm" role="alert">
              {visibleError}
            </p>
          ) : null}

          {task?.status === 'success' && video ? (
            <div className="space-y-3">
              <h2 className="text-base font-medium">
                {m['wallpaper_peeper.result']()}
              </h2>
              <video
                src={video}
                controls
                playsInline
                className={`${frameClass} w-full rounded-2xl bg-black object-contain`}
              />
              <a
                href={video}
                className="text-primary text-sm underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {m['wallpaper_peeper.open_video']()}
              </a>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full text-base"
                onClick={reset}
              >
                {m['wallpaper_peeper.again']()}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="h-12 w-full text-base"
              disabled={!file || inFlight}
              onClick={() => void generate()}
            >
              {m['wallpaper_peeper.generate']()}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
