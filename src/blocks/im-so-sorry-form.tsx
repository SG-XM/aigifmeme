import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { ApiError, apiGet, apiPost, apiUpload } from '@/lib/api-client';
import { CREDITS_CHANGED_EVENT } from '@/lib/credits-changed';
import {
  closingCaption,
  planSorrySet,
  SORRY_CREDIT_COST,
  SorryRequestError,
  sorryStyleChoices,
} from '@/lib/im-so-sorry';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { CreditPurchaseDialog } from '@/blocks/credit-purchase-dialog';
import { openAuthPrompt } from '@/components/auth-prompt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TASK_KEY = 'im-so-sorry-task';
const choices = sorryStyleChoices();
const SORRY_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

function isSorryPhoto(file: File) {
  if (SORRY_PHOTO_TYPES.has(file.type)) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function SorryPhotoField({
  preview,
  busy,
  onPick,
  onClear,
  onReject,
}: {
  preview: string;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  onReject: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  function openPicker() {
    if (busy) return;
    inputRef.current?.click();
  }

  function takeFile(next: File | null) {
    if (!next) return;
    if (!isSorryPhoto(next)) {
      onReject();
      return;
    }
    onPick(next);
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <label
        htmlFor="sorry-photo"
        className={cn('text-sm font-medium', busy && 'pointer-events-none')}
      >
        {m['sorry.photo']()}
      </label>
      <div
        className={cn(
          'relative mt-2 min-h-72 w-full flex-1 overflow-hidden rounded-xl border bg-[var(--trend-ink)] transition-colors',
          dragOver
            ? 'border-primary bg-primary/10'
            : preview
              ? 'border-border'
              : 'hover:border-primary/80 border-dashed border-white/35',
          busy && 'pointer-events-none opacity-60'
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragOver(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragOver(false);
          if (busy) return;
          takeFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <input
          ref={inputRef}
          id="sorry-photo"
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (next) takeFile(next);
          }}
        />
        {preview ? (
          <img
            src={preview}
            alt=""
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={openPicker}
            aria-describedby="sorry-photo-formats"
            className="focus-visible:ring-ring absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="border-primary/70 bg-primary/10 flex size-12 items-center justify-center rounded-full border border-dashed">
              <ImagePlus className="text-primary size-6" aria-hidden />
            </span>
            <span className="text-sm font-medium">
              {m['sorry.photo_hint']()}
            </span>
            <span
              id="sorry-photo-formats"
              className="text-muted-foreground text-xs"
            >
              {m['sorry.photo_formats']()}
            </span>
          </button>
        )}
        {preview ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-3 pt-12">
            <Button
              type="button"
              className="h-11 px-4"
              disabled={busy}
              onClick={openPicker}
            >
              {m['sorry.photo_change']()}
            </Button>
            <button
              type="button"
              aria-label={m['sorry.photo_clear']()}
              disabled={busy}
              onClick={() => {
                if (inputRef.current) inputRef.current.value = '';
                onClear();
              }}
              className="flex size-11 items-center justify-center rounded-full bg-black/65 text-white focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <span className="bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium">
              {m['sorry.photo_drop']()}
            </span>
          </div>
        ) : null}
      </div>
      {preview ? (
        <p role="status" className="sr-only">
          {m['sorry.photo_ready']()}
        </p>
      ) : null}
    </div>
  );
}

interface SorrySlide {
  index: number;
  url: string;
  caption: string;
  kind: 'edit' | 'original';
}

interface SorryTaskView {
  id: string;
  status: string;
  costCredits: number;
  styleId?: string;
  closing?: string;
  slides: SorrySlide[];
  error?: string;
}

function styleLabel(styleId: string): string {
  if (styleId === 'halloween') return m['sorry.style.halloween']();
  if (styleId === 'childhood') return m['sorry.style.childhood']();
  if (styleId === 'baby') return m['sorry.style.baby']();
  if (styleId === 'pet') return m['sorry.style.pet']();
  return m['sorry.style.sports']();
}

function lieLabel(styleId: string, lieId: string): string {
  const labels: Record<string, () => string> = {
    'halloween.wig': () => m['sorry.lie.halloween.wig'](),
    'halloween.costume': () => m['sorry.lie.halloween.costume'](),
    'halloween.party': () => m['sorry.lie.halloween.party'](),
    'halloween.makeup': () => m['sorry.lie.halloween.makeup'](),
    'childhood.house': () => m['sorry.lie.childhood.house'](),
    'childhood.blonde': () => m['sorry.lie.childhood.blonde'](),
    'childhood.candid': () => m['sorry.lie.childhood.candid'](),
    'childhood.dress': () => m['sorry.lie.childhood.dress'](),
    'baby.hair': () => m['sorry.lie.baby.hair'](),
    'baby.outfit': () => m['sorry.lie.baby.outfit'](),
    'baby.studio': () => m['sorry.lie.baby.studio'](),
    'baby.smile': () => m['sorry.lie.baby.smile'](),
    'sports.jump': () => m['sorry.lie.sports.jump'](),
    'sports.muscles': () => m['sorry.lie.sports.muscles'](),
    'sports.blonde': () => m['sorry.lie.sports.blonde'](),
    'sports.kit': () => m['sorry.lie.sports.kit'](),
    'pet.fluffy': () => m['sorry.lie.pet.fluffy'](),
    'pet.bow': () => m['sorry.lie.pet.bow'](),
    'pet.bed': () => m['sorry.lie.pet.bed'](),
    'pet.pose': () => m['sorry.lie.pet.pose'](),
  };
  return labels[`${styleId}.${lieId}`]?.() ?? lieId;
}

async function fileToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  );
  if (!blob) throw new Error('jpeg');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

async function saveSlide(url: string, name: string) {
  const response = await fetch(
    `/api/storage/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`
  );
  if (!response.ok) throw new Error('download');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = name;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export function ImSoSorryForm({ initialTaskId }: { initialTaskId?: string }) {
  const locale = getLocale();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const credits = useQuery({
    queryKey: ['user-credits', 'balance'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
    enabled: !!session?.user,
  });
  const [styleId, setStyleId] = useState('halloween');
  const [lieIds, setLieIds] = useState<string[]>(choices[0]?.lieIds ?? []);
  const [costumeNote, setCostumeNote] = useState('');
  const [captions, setCaptions] = useState<string[]>([]);
  const [captionKey, setCaptionKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const previewUrl = useRef('');
  const [taskId, setTaskId] = useState(initialTaskId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const selectionKey = `${locale}:${styleId}:${lieIds.join(',')}`;
  if (captionKey !== selectionKey) {
    setCaptionKey(selectionKey);
    if (!lieIds.length) {
      setCaptions([]);
    } else {
      try {
        setCaptions(planSorrySet({ styleId, lieIds, locale }).captions);
      } catch {
        setCaptions([]);
      }
    }
  }

  function rememberPreview(next: string) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = next;
    setPreview(next);
  }

  function pickPhoto(next: File) {
    setFile(next);
    rememberPreview(URL.createObjectURL(next));
    setError('');
  }

  function clearPhoto() {
    setFile(null);
    rememberPreview('');
    setError('');
  }

  useEffect(() => {
    if (initialTaskId) {
      setTaskId(initialTaskId);
      sessionStorage.setItem(TASK_KEY, initialTaskId);
      return;
    }
    const saved = sessionStorage.getItem(TASK_KEY);
    if (saved) setTaskId(saved);
  }, [initialTaskId]);

  const taskQuery = useQuery({
    queryKey: ['sorry-task', taskId],
    enabled: !!taskId && !!session?.user,
    queryFn: () => apiGet<SorryTaskView>(`/api/im-so-sorry/${taskId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 4000 : false;
    },
  });

  useEffect(() => {
    const status = taskQuery.data?.status;
    if (status !== 'success' && status !== 'failed') return;
    void queryClient.invalidateQueries({ queryKey: ['user-credits'] });
    void queryClient.invalidateQueries({ queryKey: ['sorry-sets'] });
    window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
  }, [queryClient, taskQuery.data?.status]);

  const style = choices.find((item) => item.id === styleId) ?? choices[0];
  const closing = closingCaption(locale);
  const showCostume = styleId === 'halloween' && lieIds.includes('costume');
  const insufficient =
    !!session?.user &&
    typeof credits.data?.balance === 'number' &&
    credits.data.balance < SORRY_CREDIT_COST;

  function chooseStyle(next: string) {
    const choice = choices.find((item) => item.id === next);
    setStyleId(next);
    setLieIds(choice?.lieIds ?? []);
    setCostumeNote('');
    setError('');
  }

  function toggleLie(lieId: string) {
    setLieIds((current) => {
      if (current.includes(lieId)) return current.filter((id) => id !== lieId);
      if (current.length >= 4) return current;
      return [...current, lieId];
    });
    setError('');
  }

  async function submit() {
    if (busy) return;
    setError('');
    if (!file) {
      setError(m['sorry.need_photo']());
      return;
    }
    if (!lieIds.length) {
      setError(m['sorry.need_lie']());
      return;
    }
    if (showCostume && costumeNote.trim()) {
      try {
        planSorrySet({
          styleId,
          lieIds,
          costumeNote,
          captions,
          locale,
        });
      } catch (reason) {
        setError(
          reason instanceof SorryRequestError
            ? m['sorry.error_color']()
            : m['sorry.error_generic']()
        );
        return;
      }
    }
    if (!session?.user) {
      openAuthPrompt({ callbackUrl: '/im-so-sorry' });
      return;
    }
    if (insufficient) {
      setPurchaseOpen(true);
      return;
    }
    setBusy(true);
    try {
      const jpeg = await fileToJpeg(file);
      const body = new FormData();
      body.append('files', jpeg);
      const uploaded = await apiUpload<{ urls: string[] }>(
        '/api/storage/upload-image',
        body
      );
      const photoUrl = uploaded.urls?.[0];
      if (!photoUrl) throw new Error('upload');
      const created = await apiPost<{ id: string }>('/api/im-so-sorry', {
        photoUrl,
        styleId,
        lieIds,
        costumeNote: showCostume ? costumeNote : '',
        captions,
        locale,
      });
      setTaskId(created.id);
      sessionStorage.setItem(TASK_KEY, created.id);
      void queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.message === 'Insufficient credits'
      ) {
        setPurchaseOpen(true);
      } else if (
        reason instanceof ApiError &&
        /color|costume/i.test(reason.message)
      ) {
        setError(m['sorry.error_color']());
      } else if (
        reason instanceof ApiError &&
        /upload the photo|storage/i.test(reason.message)
      ) {
        setError(m['sorry.error_storage']());
      } else {
        setError(m['sorry.error_generic']());
      }
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll(slides: SorrySlide[]) {
    for (const slide of slides) {
      await saveSlide(slide.url, `im-so-sorry-${slide.index + 1}.jpg`);
    }
  }

  const slides = taskQuery.data?.slides ?? [];
  const finished = taskQuery.data?.status === 'success';

  return (
    <>
      <div className="trend-console">
        <div className="trend-upload-step flex flex-col">
          <h2>{m['sorry.form_title']()}</h2>
          <SorryPhotoField
            preview={preview}
            busy={busy}
            onPick={pickPhoto}
            onClear={clearPhoto}
            onReject={() => setError(m['sorry.photo_type']())}
          />
        </div>
        <div className="trend-settings-step">
          <p className="text-sm font-medium">{m['sorry.style']()}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.id}
                type="button"
                variant={choice.id === styleId ? 'default' : 'outline'}
                aria-pressed={choice.id === styleId}
                onClick={() => chooseStyle(choice.id)}
              >
                {styleLabel(choice.id)}
              </Button>
            ))}
          </div>
          <p className="mt-4 text-sm font-medium">{m['sorry.lies']()}</p>
          <p className="text-muted-foreground text-xs">
            {m['sorry.lies_hint']()}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {style?.lieIds.map((lieId) => (
              <Button
                key={lieId}
                type="button"
                variant={lieIds.includes(lieId) ? 'default' : 'outline'}
                aria-pressed={lieIds.includes(lieId)}
                onClick={() => toggleLie(lieId)}
              >
                {lieLabel(styleId, lieId)}
              </Button>
            ))}
          </div>
          {showCostume ? (
            <label className="mt-4 block text-sm font-medium">
              {m['sorry.costume_note']()}
              <Input
                className="mt-2"
                value={costumeNote}
                placeholder={m['sorry.costume_placeholder']()}
                maxLength={80}
                onChange={(event) => setCostumeNote(event.target.value)}
              />
              <span className="text-muted-foreground mt-1 block text-xs font-normal">
                {m['sorry.costume_color']()}
              </span>
            </label>
          ) : null}
          {captions.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">{m['sorry.captions']()}</p>
              <div className="mt-2 grid gap-2">
                {captions.map((caption, index) => (
                  <label key={`${selectionKey}-${index}`} className="text-xs">
                    {m['sorry.slide']({ index: index + 1 })}
                    <Input
                      className="mt-1"
                      value={caption}
                      maxLength={140}
                      onChange={(event) =>
                        setCaptions((current) =>
                          current.map((line, lineIndex) =>
                            lineIndex === index ? event.target.value : line
                          )
                        )
                      }
                    />
                  </label>
                ))}
                <label className="text-xs">
                  {m['sorry.closing_label']()}
                  <Input className="mt-1" value={closing} readOnly />
                  <span className="text-muted-foreground mt-1 block">
                    {m['sorry.closing_fixed']()}
                  </span>
                </label>
              </div>
            </div>
          ) : null}
        </div>
        <div className="trend-console-footer">
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? m['sorry.generating']() : m['sorry.generate']()}
          </Button>
          <p className="text-muted-foreground mt-2 text-sm">
            {m['sorry.cost']()}
          </p>
          {error ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {error}
            </p>
          ) : null}
          {taskQuery.data?.status === 'failed' ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {m['sorry.failed']()}
            </p>
          ) : null}
          {taskQuery.data &&
          (taskQuery.data.status === 'pending' ||
            taskQuery.data.status === 'processing') ? (
            <p className="mt-2 text-sm">{m['sorry.working']()}</p>
          ) : null}
          {slides.length > 0 ? (
            <div className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-medium">
                  {m['sorry.preview']()}
                </h3>
                {finished ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void downloadAll(slides)}
                  >
                    {m['sorry.download_all']()}
                  </Button>
                ) : null}
              </div>
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                {slides.map((slide) => (
                  <figure
                    key={slide.index}
                    className="w-[72%] max-w-[280px] shrink-0 snap-center"
                  >
                    <img
                      src={slide.url}
                      alt={slide.caption}
                      className="aspect-[3/4] w-full rounded-lg object-cover"
                    />
                    <figcaption className="mt-2 text-center text-sm">
                      {slide.caption}
                    </figcaption>
                    {finished ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 w-full"
                        onClick={() =>
                          void saveSlide(
                            slide.url,
                            `im-so-sorry-${slide.index + 1}.jpg`
                          )
                        }
                      >
                        {m['sorry.download']()}
                      </Button>
                    ) : null}
                  </figure>
                ))}
              </div>
              {finished ? (
                <p className="mt-3 text-sm">{m['sorry.sound']()}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <CreditPurchaseDialog
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        redirect="/im-so-sorry"
      />
    </>
  );
}
