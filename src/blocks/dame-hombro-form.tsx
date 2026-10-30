import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { ApiError, apiGet, apiPost, apiUpload } from '@/lib/api-client';
import {
  DAME_HOMBRO_ASPECTS,
  DAME_HOMBRO_DEFAULTS,
  DAME_HOMBRO_DURATIONS,
  DAME_HOMBRO_EFFECTS,
  DAME_HOMBRO_MODELS,
  DAME_HOMBRO_PATH,
  DAME_HOMBRO_POLL_MS,
  DAME_HOMBRO_PRICED_CELLS,
  DAME_HOMBRO_RESOLUTIONS,
  dameHombroCredits,
  isDameHombroTaskId,
  type DameHombroAspect,
  type DameHombroDuration,
  type DameHombroEffect,
  type DameHombroModel,
  type DameHombroResolution,
  type DameHombroStatus,
  type DameHombroTaskView,
} from '@/lib/dame-hombro';
import { m } from '@/paraglide/messages.js';
import { openAuthPrompt } from '@/components/auth-prompt';

const TASK_KEY = 'dame-hombro-task';
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type SlotName = 'left' | 'center' | 'right';
type SlotPhoto = { file: File; name: string; preview: string };

const SLOT_ORDER: SlotName[] = ['left', 'center', 'right'];

function isPhotoFile(file: File): boolean {
  if (PHOTO_TYPES.has(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function statusCopy(status: DameHombroStatus): string {
  if (status === 'pending') return m['dame_hombro.status_pending']();
  if (status === 'processing') return m['dame_hombro.status_processing']();
  if (status === 'success') return m['dame_hombro.status_success']();
  if (status === 'failed') return m['dame_hombro.status_failed']();
  return m['dame_hombro.status_canceled']();
}

export function DameHombroForm() {
  const { data: session, isPending } = useSession();
  const [hydrated, setHydrated] = useState(false);
  const [photos, setPhotos] = useState<Partial<Record<SlotName, SlotPhoto>>>(
    {}
  );
  const [model, setModel] = useState<DameHombroModel>(
    DAME_HOMBRO_DEFAULTS.model
  );
  const [resolution, setResolution] = useState<DameHombroResolution>(
    DAME_HOMBRO_DEFAULTS.resolution
  );
  const [duration, setDuration] = useState<DameHombroDuration>(
    DAME_HOMBRO_DEFAULTS.duration
  );
  const [aspectRatio, setAspectRatio] = useState<DameHombroAspect>(
    DAME_HOMBRO_DEFAULTS.aspectRatio
  );
  const [effect, setEffect] = useState<DameHombroEffect>(
    DAME_HOMBRO_DEFAULTS.effect
  );
  const [taskId, setTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const targetSlot = useRef<SlotName>('center');
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    setHydrated(true);
    const saved = sessionStorage.getItem(TASK_KEY);
    if (saved && isDameHombroTaskId(saved)) setTaskId(saved);
  }, []);

  useEffect(
    () => () => {
      for (const photo of Object.values(photosRef.current)) {
        if (photo) URL.revokeObjectURL(photo.preview);
      }
    },
    []
  );

  const taskQuery = useQuery({
    queryKey: ['dame-hombro', taskId],
    enabled: Boolean(taskId),
    queryFn: () => apiGet<DameHombroTaskView>(`/api/dame-hombro/${taskId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === 'success' ||
        status === 'failed' ||
        status === 'canceled'
      ) {
        return false;
      }
      if (query.state.error instanceof ApiError) {
        const message = query.state.error.message;
        if (message === 'Not found' || message === 'Unauthorized') return false;
      }
      return DAME_HOMBRO_POLL_MS;
    },
  });

  const credits = dameHombroCredits(model, resolution);
  const sessionKnown = hydrated && !isPending;
  const signedIn = sessionKnown && Boolean(session?.user);
  const taskStatus = taskQuery.data?.status;
  const inFlight =
    busy || taskStatus === 'pending' || taskStatus === 'processing';
  const videoUrl = taskQuery.data?.videos.find((url) =>
    url.startsWith('https://')
  );

  function setSlot(slot: SlotName, file: File | null) {
    setPhotos((current) => {
      const previous = current[slot];
      if (previous) URL.revokeObjectURL(previous.preview);
      const next = { ...current };
      if (!file) delete next[slot];
      else {
        next[slot] = {
          file,
          name: file.name,
          preview: URL.createObjectURL(file),
        };
      }
      return next;
    });
    setError('');
  }

  function browse(slot: SlotName) {
    targetSlot.current = slot;
    inputRef.current?.click();
  }

  function onFiles(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!isPhotoFile(file)) {
      setError(m['dame_hombro.photo_type']());
      return;
    }
    setSlot(targetSlot.current, file);
  }

  async function submit() {
    if (busy) return;
    setError('');
    if (!photos.center) {
      setError(m['dame_hombro.need_center']());
      return;
    }
    if (credits == null) {
      setError(m['dame_hombro.unpriced']());
      return;
    }
    if (!session?.user) {
      openAuthPrompt({ callbackUrl: `${DAME_HOMBRO_PATH}#create` });
      return;
    }
    setBusy(true);
    try {
      const order: SlotName[] =
        effect === 'trio' ? ['center', 'left', 'right'] : ['center'];
      const chosen = order.flatMap((slot) => {
        const photo = photos[slot];
        return photo ? [{ slot, photo }] : [];
      });
      const body = new FormData();
      for (const item of chosen) body.append('files', item.photo.file);
      body.append('requirePublic', 'true');
      const uploaded = await apiUpload<{ urls: string[] }>(
        '/api/storage/upload-image',
        body
      );
      const urls = uploaded.urls ?? [];
      if (urls.length !== chosen.length || !urls[0]) {
        throw new Error('upload');
      }
      const bySlot = new Map(
        chosen.map((item, index) => [item.slot, urls[index]])
      );
      const created = await apiPost<DameHombroTaskView>('/api/dame-hombro', {
        centerUrl: bySlot.get('center'),
        leftUrl: effect === 'trio' ? bySlot.get('left') : undefined,
        rightUrl: effect === 'trio' ? bySlot.get('right') : undefined,
        model,
        resolution,
        duration,
        aspectRatio,
        effect,
      });
      if (!isDameHombroTaskId(created.taskId)) {
        throw new Error('task');
      }
      sessionStorage.setItem(TASK_KEY, created.taskId);
      setTaskId(created.taskId);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      if (/storage|HTTPS|public/i.test(message)) {
        setError(m['dame_hombro.error_storage']());
      } else if (reason instanceof ApiError && message) {
        setError(message);
      } else {
        setError(m['dame_hombro.error_generic']());
      }
    } finally {
      setBusy(false);
    }
  }

  function another() {
    sessionStorage.removeItem(TASK_KEY);
    setTaskId(null);
    setError('');
  }

  const slots = effect === 'trio' ? SLOT_ORDER : (['center'] as const);

  return (
    <form
      id="create"
      className="trend-console uptown-create-card dame-hombro-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div
        className={
          effect === 'trio'
            ? 'dame-hombro-faces'
            : 'dame-hombro-faces dame-hombro-faces-solo'
        }
      >
        {slots.map((slot) => (
          <FaceSlot
            key={slot}
            slot={slot}
            photo={photos[slot]}
            busy={inFlight}
            onBrowse={() => browse(slot)}
            onRemove={() => setSlot(slot, null)}
          />
        ))}
      </div>
      <ChoiceRow
        label={m['dame_hombro.effect']()}
        value={effect}
        options={DAME_HOMBRO_EFFECTS.map((value) => ({
          value,
          label:
            value === 'trio'
              ? m['dame_hombro.effect_trio']()
              : m['dame_hombro.effect_solo'](),
        }))}
        disabled={inFlight}
        onChange={setEffect}
      />
      <ChoiceRow
        label={m['dame_hombro.model']()}
        value={model}
        options={DAME_HOMBRO_MODELS.map((value) => ({
          value,
          label: value,
        }))}
        disabled={inFlight}
        onChange={setModel}
      />
      <ChoiceRow
        label={m['dame_hombro.resolution']()}
        value={resolution}
        options={DAME_HOMBRO_RESOLUTIONS.map((value) => ({
          value,
          label: value,
        }))}
        disabled={inFlight}
        onChange={setResolution}
      />
      <ChoiceRow
        label={m['dame_hombro.duration']()}
        value={String(duration)}
        options={DAME_HOMBRO_DURATIONS.map((value) => ({
          value: String(value),
          label: `${value}s`,
        }))}
        disabled={inFlight}
        onChange={(value) => setDuration(Number(value) as DameHombroDuration)}
      />
      <ChoiceRow
        label={m['dame_hombro.aspect']()}
        value={aspectRatio}
        options={DAME_HOMBRO_ASPECTS.map((value) => ({
          value,
          label: value,
        }))}
        disabled={inFlight}
        onChange={setAspectRatio}
      />

      <section
        className="dame-hombro-price"
        aria-labelledby="dame-hombro-price"
      >
        <h2 id="dame-hombro-price">{m['dame_hombro.price_heading']()}</h2>
        <p>{m['dame_hombro.price_note']()}</p>
        <ul className="dame-hombro-prices">
          {DAME_HOMBRO_PRICED_CELLS.map((cell) => {
            const current =
              cell.model === model && cell.resolution === resolution;
            return (
              <li
                key={`${cell.model}-${cell.resolution}`}
                data-current={current ? 'true' : undefined}
              >
                {m['dame_hombro.price_cell']({
                  model: cell.model,
                  resolution: cell.resolution,
                  credits: cell.credits,
                })}
              </li>
            );
          })}
        </ul>
        <p className="uptown-hint">
          {credits == null
            ? m['dame_hombro.unpriced']()
            : m['dame_hombro.selected_price']({ credits })}
        </p>
      </section>

      {taskQuery.data ? (
        <div className="dame-hombro-status" aria-live="polite">
          <p>{statusCopy(taskQuery.data.status)}</p>
          {taskQuery.data.freerapCreditsCharged != null &&
          taskQuery.data.status === 'success' ? (
            <p>
              {m['dame_hombro.selected_price']({
                credits: taskQuery.data.freerapCreditsCharged,
              })}
            </p>
          ) : null}
          {videoUrl ? (
            <figure>
              <video
                src={videoUrl}
                controls
                playsInline
                aria-label={m['dame_hombro.video_label']()}
              />
              <figcaption>
                <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                  {m['dame_hombro.open_video']()}
                </a>
                <span className="dame-hombro-url">{videoUrl}</span>
              </figcaption>
            </figure>
          ) : null}
          {taskQuery.data.status === 'success' ||
          taskQuery.data.status === 'failed' ||
          taskQuery.data.status === 'canceled' ? (
            <button type="button" className="uptown-multi" onClick={another}>
              {m['dame_hombro.another']()}
            </button>
          ) : null}
        </div>
      ) : null}

      {error || taskQuery.error ? (
        <p className="dame-hombro-error" role="alert">
          {error ||
            (taskQuery.error instanceof Error
              ? taskQuery.error.message
              : m['dame_hombro.error_generic']())}
        </p>
      ) : null}

      <div className="uptown-generate-bar">
        {sessionKnown && !signedIn ? (
          <p className="uptown-hint">{m['dame_hombro.sign_in']()}</p>
        ) : null}
        <button
          type="submit"
          className="trend-button trend-button-primary uptown-pick"
          disabled={inFlight || credits == null}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy
            ? m['dame_hombro.uploading']()
            : inFlight
              ? m['dame_hombro.generating']()
              : m['dame_hombro.generate']()}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={m['dame_hombro.add_photo']()}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </form>
  );
}

function FaceSlot({
  slot,
  photo,
  busy,
  onBrowse,
  onRemove,
}: {
  slot: SlotName;
  photo?: SlotPhoto;
  busy: boolean;
  onBrowse: () => void;
  onRemove: () => void;
}) {
  const label =
    slot === 'center'
      ? m['dame_hombro.center']()
      : slot === 'left'
        ? m['dame_hombro.left']()
        : m['dame_hombro.right']();
  const hint =
    slot === 'center'
      ? m['dame_hombro.required']()
      : m['dame_hombro.optional']();
  return (
    <div
      className="uptown-slot"
      data-lead={slot === 'center' ? 'true' : undefined}
    >
      <button
        type="button"
        className={photo ? 'uptown-slot-hit' : 'uptown-slot-empty'}
        disabled={busy}
        aria-label={`${label}. ${hint}`}
        onClick={onBrowse}
      >
        {photo ? (
          <>
            <img src={photo.preview} alt={label} />
            <span className="uptown-replace">{m['dame_hombro.replace']()}</span>
          </>
        ) : (
          <>
            <ImagePlus className="size-5" />
            <span>{m['dame_hombro.add_photo']()}</span>
          </>
        )}
        <span className="uptown-slot-tag">{label}</span>
      </button>
      {photo ? (
        <button
          type="button"
          className="uptown-remove"
          aria-label={`${m['dame_hombro.remove']()} ${label}`}
          disabled={busy}
          onClick={onRemove}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="uptown-length dame-hombro-field" disabled={disabled}>
      <legend>{label}</legend>
      <div
        className="uptown-length-pills dame-hombro-pills"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
