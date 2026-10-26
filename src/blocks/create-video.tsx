import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { agentLibraryQueryKey } from '@/lib/agent-library-query';
import {
  aspectRatiosForModel,
  creditsForGeneration,
  defaultComposerSettings,
  durationsForModel,
  isSelectableModelOption,
  modelOptionFor,
  resolutionsForModel,
  resolveGenerationSettings,
  SEEDANCE_25_REFERENCE_OUTPUT_SECONDS,
  SELECTABLE_AGENT_MODEL_OPTIONS,
  settingsForModel,
} from '@/lib/agent-settings';
import { effectHash, type EffectCampaign } from '@/lib/ai-video-paths';
import { apiGet, apiPost, apiUpload } from '@/lib/api-client';
import { rememberAuthIntent, takeAuthIntent } from '@/lib/auth-return';
import { SOLO_DEMO } from '@/lib/bulin-reference';
import { TRIO_DEMO } from '@/lib/bulin-trio-reference';
import { readCheckoutResume } from '@/lib/checkout-resume';
import {
  clearCreateDraft,
  loadCreateDraft,
  saveCreateDraft,
  type CreateDraft,
} from '@/lib/create-draft';
import type { CreateVideoTask } from '@/lib/create-video';
import { CREDIT_PAYWALL_SCENE } from '@/lib/credit-paywall';
import { notifyCreditsChanged } from '@/lib/credits-changed';
import {
  formatProofNumber,
  QUALITY_PROOF_ROUNDS,
  QUALITY_PROOF_VIDEOS,
} from '@/lib/social-proof';
import { VIDEO_RETENTION_EVENT } from '@/lib/video-retention-offer';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { useAgentHeader } from '@/components/agent/agent-header-context';
import { CreateTaskCard } from '@/components/agent/create-task-card';
import { openAuthPrompt } from '@/components/auth-prompt';
import { Button } from '@/components/ui/button';

const CreditPurchaseDialog = lazy(() =>
  import('@/blocks/credit-purchase-dialog').then((mod) => ({
    default: mod.CreditPurchaseDialog,
  }))
);

interface Plan {
  productId: string;
  name: string;
  priceInCents: number;
  currency: string;
  credits: number;
  interval: string;
  intervalCount: number;
}
interface Reference {
  url: string;
  name: string;
  /** Present until the file is uploaded. Logged-out picks stay local. */
  file?: File;
}

function EffectDemoPreview({
  src,
  poster,
  trio,
  label,
}: {
  src: string;
  poster: string;
  trio: boolean;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);

  useEffect(() => {
    setActiveSrc(null);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSrc) return;
    void video.play().catch(() => undefined);
  }, [activeSrc]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={activeSrc ?? undefined}
        poster={poster}
        controls={activeSrc != null}
        playsInline
        preload="none"
        className={
          trio
            ? 'aspect-[3/4] max-h-96 w-full bg-black object-cover'
            : 'mx-auto aspect-[9/16] max-h-96 w-auto max-w-full bg-black object-cover'
        }
      />
      {activeSrc == null ? (
        <button
          type="button"
          aria-label={label}
          onClick={() => setActiveSrc(src)}
          className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      ) : null}
    </div>
  );
}

export function CreateVideo({
  campaign = 'bulin',
  embedded = false,
  generatedCount = null,
}: {
  campaign?: EffectCampaign;
  embedded?: boolean;
  /** Live `(users × 6) + 3` figure from `getGeneratedVideoCount`. */
  generatedCount?: number | null;
} = {}) {
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const signedIn = hydrated && !!session?.user;
  const returnPath = effectHash(campaign, 'create');
  const peeper = campaign === 'peeper';
  const { setContent } = useAgentHeader();
  const [effect, setEffect] = useState<'solo' | 'trio'>('solo');
  const isTrio = campaign === 'bulin' && effect === 'trio';
  const [settings, setSettings] = useState(() => ({
    ...defaultComposerSettings(),
    aspectRatio: campaign === 'bridges' ? '16:9' : '9:16',
    duration: campaign === 'bridges' ? 15 : defaultComposerSettings().duration,
  }));
  const needsSeedance = campaign === 'bridges' || peeper || isTrio;
  const availableModels = needsSeedance
    ? SELECTABLE_AGENT_MODEL_OPTIONS.filter((item) =>
        item.value.startsWith('seedance-2')
      )
    : SELECTABLE_AGENT_MODEL_OPTIONS;
  useEffect(() => {
    if (
      !isSelectableModelOption(settings.modelOption) ||
      (needsSeedance && !settings.modelOption.startsWith('seedance-2'))
    ) {
      const fallback = availableModels[0];
      if (fallback) {
        setSettings((current) =>
          settingsForModel(
            { ...current, modelOption: fallback.value },
            fallback.value
          )
        );
      }
    }
  }, [needsSeedance, settings.modelOption]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [trioSlots, setTrioSlots] = useState<{
    left?: Reference;
    center?: Reference;
    right?: Reference;
  }>({});
  const uploadTarget = useRef<'solo' | 'left' | 'center' | 'right'>('solo');
  const trioOrdered: Reference[] = [
    trioSlots.left,
    trioSlots.center,
    trioSlots.right,
  ].filter((item): item is Reference => !!item);
  const primaryPhoto = isTrio ? trioSlots.center : references[0];
  const hasPhoto = isTrio ? !!trioSlots.center : references.length > 0;
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseExperimentScene, setPurchaseExperimentScene] = useState<
    string | undefined
  >();
  useEffect(() => {
    const request = readCheckoutResume(window.location.search);
    if (!request) return;
    if (request.placement === 'credit-insufficient') {
      setPurchaseExperimentScene(CREDIT_PAYWALL_SCENE);
      setPurchaseOpen(true);
    } else if (request.placement === 'create') {
      setPurchaseOpen(true);
    }
  }, []);
  const retentionTrigger = useRef(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastStatuses = useRef('');
  const locale = getLocale();
  // This screen always generates from a reference clip. Seedance 2.5 follows
  // that source, so length and ratio are not choices: 15 seconds, adaptive.
  const referenceOutputLocked = settings.modelOption === 'seedance-2-5';
  const pricedDuration = isTrio
    ? settings.duration
    : referenceOutputLocked
      ? SEEDANCE_25_REFERENCE_OUTPUT_SECONDS
      : settings.duration;
  const pricedAspectRatio = isTrio
    ? 'auto'
    : referenceOutputLocked
      ? 'auto'
      : settings.aspectRatio;
  const cost = creditsForGeneration(
    settings.modelOption,
    pricedDuration,
    settings.resolution
  );
  const model = modelOptionFor(settings.modelOption)!;

  useEffect(() => {
    setContent({ title: m['create.title']() });
    return () => setContent({});
  }, [setContent]);

  const tasksQuery = useQuery({
    queryKey: ['create-tasks'],
    enabled: signedIn,
    queryFn: () =>
      apiGet<{ tasks: CreateVideoTask[] }>(
        '/api/agent/create-tasks?activeOnly=true&limit=100'
      ),
    refetchInterval: (query) =>
      query.state.data?.tasks.some((task) =>
        ['pending', 'processing'].includes(task.status)
      )
        ? 5000
        : false,
    refetchIntervalInBackground: true,
  });
  const tasks = signedIn ? (tasksQuery.data?.tasks ?? []) : [];
  const activeTasks = tasks.filter((task) =>
    ['pending', 'processing'].includes(task.status)
  );
  const credits = useQuery({
    queryKey: ['user-credits', 'balance'],
    enabled: signedIn,
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
  });
  const plans = useQuery({
    queryKey: ['create-plans', locale],
    queryFn: () => apiGet<Plan[]>(`/api/subscription-plans?locale=${locale}`),
  });
  const monthly = plans.data
    ?.filter(
      (plan) =>
        plan.interval === 'month' &&
        plan.intervalCount === 1 &&
        plan.credits >= cost
    )
    .sort((a, b) => a.priceInCents - b.priceInCents)[0];
  const insufficient =
    signedIn && credits.data !== undefined && credits.data.balance < cost;
  useEffect(() => {
    const signature = tasks
      .map((task) => `${task.id}:${task.status}`)
      .join('|');
    if (signature === lastStatuses.current) return;
    lastStatuses.current = signature;
    notifyCreditsChanged();
    void queryClient.invalidateQueries({ queryKey: agentLibraryQueryKey });
    void queryClient.invalidateQueries({ queryKey: ['create-task-history'] });
  }, [tasks, queryClient]);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const data = new FormData();
      files.forEach((file) => data.append('files', file));
      const result = await apiUpload<{ urls: string[] }>(
        '/api/storage/upload-image',
        data
      );
      if (result.urls.some((url) => !url.startsWith('https://')))
        throw new Error(m['create.storage_required']());
      return result.urls.map((url, index) => ({
        url,
        name: files[index].name,
      }));
    },
    onSuccess: (items) => {
      const target = uploadTarget.current;
      if (target === 'solo') {
        setReferences(items.slice(0, 1));
      } else if (items[0]) {
        setTrioSlots((current) => ({ ...current, [target]: items[0] }));
      }
      setUploadError('');
    },
    onError: (error) => setUploadError(error.message),
  });
  const generate = useMutation({
    mutationFn: (body: {
      images: string[];
      effect: 'solo' | 'trio';
      slots?: { left?: string; center: string; right?: string };
    }) =>
      apiPost('/api/agent/create', {
        campaign,
        take: 0,
        ...(body.effect === 'trio'
          ? { effect: 'trio' as const, slots: body.slots }
          : {}),
        images: body.images,
        settings: (() => {
          const { creditCost, ...value } = resolveGenerationSettings({
            ...settings,
            duration: pricedDuration,
            aspectRatio: pricedAspectRatio,
          });
          return campaign === 'bulin'
            ? { ...value, audioMode: 'model' as const }
            : value;
        })(),
      }),
    onSuccess: async () => {
      await clearCreateDraft();
      notifyCreditsChanged();
      await queryClient.invalidateQueries({ queryKey: ['create-tasks'] });
      await queryClient.invalidateQueries({
        queryKey: ['create-task-history'],
      });
    },
    onError: (error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ['create-tasks'] });
      void queryClient.invalidateQueries({
        queryKey: ['create-task-history'],
      });
    },
  });
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const photosTouched = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const busy =
    generate.isPending || upload.isPending || preparing || sessionPending;
  const stateRef = useRef({
    references,
    trioSlots,
    isTrio,
    effect,
    settings,
    campaign,
    cost,
    hasPhoto,
  });
  stateRef.current = {
    references,
    trioSlots,
    isTrio,
    effect,
    settings,
    campaign,
    cost,
    hasPhoto,
  };

  function releasePreview(item?: Reference) {
    if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
  }

  function currentDraft(): CreateDraft {
    const snap = stateRef.current;
    const photos: CreateDraft['photos'] = [];
    const push = (
      slot: CreateDraft['photos'][number]['slot'],
      item?: Reference
    ) => {
      if (!item?.file) return;
      photos.push({
        slot,
        name: item.name,
        type: item.file.type || 'application/octet-stream',
        blob: item.file,
      });
    };
    if (snap.isTrio) {
      push('left', snap.trioSlots.left);
      push('center', snap.trioSlots.center);
      push('right', snap.trioSlots.right);
    } else {
      for (const item of snap.references) push('solo', item);
    }
    return {
      campaign: snap.campaign,
      effect: snap.effect,
      settings: {
        modelOption: snap.settings.modelOption,
        resolution: snap.settings.resolution,
        duration: snap.settings.duration,
        aspectRatio: snap.settings.aspectRatio,
      },
      photos,
      savedAt: Date.now(),
    };
  }

  async function materialize(snap: typeof stateRef.current) {
    async function uploaded(item: Reference): Promise<Reference> {
      if (!item.file) return { url: item.url, name: item.name };
      const data = new FormData();
      data.append('files', item.file);
      const result = await apiUpload<{ urls: string[] }>(
        '/api/storage/upload-image',
        data
      );
      const url = result.urls[0];
      if (!url?.startsWith('https://'))
        throw new Error(m['create.storage_required']());
      releasePreview(item);
      return { url, name: item.name };
    }
    if (snap.isTrio) {
      const next = { ...snap.trioSlots };
      for (const slot of ['left', 'center', 'right'] as const) {
        if (next[slot]) next[slot] = await uploaded(next[slot]);
      }
      setTrioSlots(next);
      const center = next.center;
      if (!center) throw new Error(m['create.image_required']());
      return {
        images: [next.left, next.center, next.right]
          .filter((item): item is Reference => !!item)
          .map((item) => item.url),
        slots: {
          ...(next.left ? { left: next.left.url } : {}),
          center: center.url,
          ...(next.right ? { right: next.right.url } : {}),
        },
      };
    }
    const next: Reference[] = [];
    for (const item of snap.references) next.push(await uploaded(item));
    setReferences(next);
    if (!next.length) throw new Error(m['create.image_required']());
    return { images: next.map((item) => item.url) };
  }

  const runGenerateRef = useRef<() => Promise<void>>(async () => {});
  runGenerateRef.current = async () => {
    if (generate.isPending || preparingRef.current) return;
    const snap = stateRef.current;
    if (!snap.hasPhoto) {
      openFilePicker(snap.isTrio ? 'center' : 'solo');
      return;
    }
    preparingRef.current = true;
    try {
      let balance = queryClient.getQueryData<{ balance: number }>([
        'user-credits',
        'balance',
      ])?.balance;
      if (balance === undefined) {
        const fresh = await queryClient.fetchQuery({
          queryKey: ['user-credits', 'balance'],
          queryFn: () => apiGet<{ balance: number }>('/api/credits'),
        });
        balance = fresh.balance;
      }
      if (balance < snap.cost) {
        retentionTrigger.current = true;
        setPurchaseExperimentScene(CREDIT_PAYWALL_SCENE);
        setPurchaseOpen(true);
        return;
      }
      setPreparing(true);
      const payload = await materialize(snap);
      await generate
        .mutateAsync({
          images: payload.images,
          effect: snap.isTrio ? 'trio' : 'solo',
          slots: payload.slots,
        })
        .catch(() => {});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m['create.storage_required']();
      setUploadError(message);
      toast.error(message);
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadCreateDraft().catch(() => null);
      if (cancelled || photosTouched.current) {
        if (!cancelled) setDraftReady(true);
        return;
      }
      if (draft && draft.campaign === campaign) {
        const solo: Reference[] = [];
        const slots: {
          left?: Reference;
          center?: Reference;
          right?: Reference;
        } = {};
        for (const photo of draft.photos) {
          const file = new File([photo.blob], photo.name, {
            type: photo.type || photo.blob.type,
          });
          const item: Reference = {
            url: URL.createObjectURL(file),
            name: photo.name,
            file,
          };
          if (photo.slot === 'solo') solo.push(item);
          else slots[photo.slot] = item;
        }
        if (draft.effect === 'solo' || draft.effect === 'trio')
          setEffect(draft.effect);
        const modelOption = draft.settings.modelOption;
        if (isSelectableModelOption(modelOption)) {
          setSettings((current) =>
            settingsForModel(
              {
                ...current,
                modelOption,
                resolution: draft.settings.resolution,
                duration: draft.settings.duration,
                aspectRatio: draft.settings.aspectRatio,
              },
              modelOption
            )
          );
        }
        if (solo.length) setReferences(solo.slice(0, 1));
        if (slots.left || slots.center || slots.right) setTrioSlots(slots);
      }
      if (!cancelled) setDraftReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign]);

  useEffect(() => {
    if (!draftReady || signedIn) return;
    const draft = currentDraft();
    if (!draft.photos.length) {
      if (photosTouched.current) void clearCreateDraft();
      return;
    }
    void saveCreateDraft(draft);
  }, [draftReady, signedIn, references, trioSlots, effect, settings, campaign]);

  useEffect(() => {
    if (!hydrated || sessionPending || !signedIn || !draftReady) return;
    const intent = takeAuthIntent();
    if (!intent) return;
    if (intent === 'purchase') {
      setPurchaseExperimentScene(undefined);
      setPurchaseOpen(true);
      return;
    }
    void runGenerateRef.current();
  }, [hydrated, sessionPending, signedIn, draftReady]);

  function previewUrls() {
    const snap = stateRef.current;
    const items = snap.isTrio
      ? [snap.trioSlots.left, snap.trioSlots.center, snap.trioSlots.right]
      : snap.references;
    return items
      .filter((item): item is Reference => !!item)
      .map((item) => item.url);
  }

  async function prepareAuthReturn(action: 'generate' | 'purchase') {
    rememberAuthIntent(action);
    const draft = currentDraft();
    if (draft.photos.length) await saveCreateDraft(draft);
  }

  function promptAuth(action: 'generate' | 'purchase') {
    openAuthPrompt({
      callbackUrl: returnPath,
      previews: previewUrls(),
      beforeRedirect: () => prepareAuthReturn(action),
      onSuccess: () => {
        takeAuthIntent();
        if (action === 'purchase') {
          setPurchaseExperimentScene(undefined);
          setPurchaseOpen(true);
          return;
        }
        void runGenerateRef.current();
      },
    });
  }

  async function submit() {
    if (busy) return;
    if (!hasPhoto) {
      openFilePicker(isTrio ? 'center' : 'solo');
      return;
    }
    if (!signedIn) {
      promptAuth('generate');
      return;
    }
    if (insufficient) {
      retentionTrigger.current = true;
      setPurchaseExperimentScene(CREDIT_PAYWALL_SCENE);
      setPurchaseOpen(true);
      return;
    }
    await runGenerateRef.current();
  }

  function openFilePicker(target: 'solo' | 'left' | 'center' | 'right') {
    uploadTarget.current = target;
    fileRef.current?.click();
  }

  function selectEffect(next: 'solo' | 'trio') {
    setEffect(next);
    setUploadError('');
    if (next === 'trio')
      setSettings((current) => ({ ...current, duration: 12 }));
  }

  function stageLocal(file: File) {
    photosTouched.current = true;
    const item: Reference = {
      url: URL.createObjectURL(file),
      name: file.name,
      file,
    };
    const snap = stateRef.current;
    const target = uploadTarget.current;
    let nextReferences = snap.references;
    let nextSlots = snap.trioSlots;
    if (target === 'solo') {
      snap.references.forEach(releasePreview);
      nextReferences = [item];
      setReferences(nextReferences);
    } else {
      releasePreview(snap.trioSlots[target]);
      nextSlots = { ...snap.trioSlots, [target]: item };
      setTrioSlots(nextSlots);
    }
    stateRef.current = {
      ...snap,
      references: nextReferences,
      trioSlots: nextSlots,
      hasPhoto: snap.isTrio ? !!nextSlots.center : nextReferences.length > 0,
    };
    const draft = currentDraft();
    if (draft.photos.length) void saveCreateDraft(draft);
  }

  function selectFiles(files: File[]) {
    if (busy || !files.length) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (
      files.some(
        (file) => !allowed.includes(file.type) || file.size > 10 * 1024 * 1024
      )
    ) {
      setUploadError(m['create.image_format']());
      return;
    }
    if (
      uploadTarget.current === 'solo' &&
      files.length + references.length > 1
    ) {
      setUploadError(m['create.image_limit']());
      return;
    }
    if (uploadTarget.current !== 'solo' && files.length > 1) {
      setUploadError(m['create.image_limit']());
      return;
    }
    void apiPost('/api/funnel/event', { event: 'photo_selected' }).catch(
      () => undefined
    );
    const file = files[0];
    if (!file) return;
    if (signedIn) {
      photosTouched.current = true;
      upload.mutate([file]);
      return;
    }
    stageLocal(file);
  }

  return (
    <div className="trend-create h-full overflow-x-hidden overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pt-5 pb-16 sm:px-8">
        {!embedded && (
          <section className="mx-auto max-w-3xl text-center">
            <h2 className="font-sans text-4xl font-semibold tracking-tight sm:text-5xl">
              {peeper
                ? m['effect.peeper.title']()
                : campaign === 'bridges'
                  ? m['trend.bridges.generator_title']()
                  : m['trend.bulin.generator_title']()}
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed">
              {peeper
                ? m['effect.peeper.description']()
                : campaign === 'bridges'
                  ? m['trend.bridges.generator_description']()
                  : m['trend.bulin.generator_description']()}
            </p>
          </section>
        )}
        <form
          ref={formRef}
          id="trend-generator-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className={
            embedded
              ? 'trend-console scroll-mt-24'
              : 'bg-card border-border mx-auto mt-8 max-w-2xl scroll-mt-24 space-y-6 rounded-2xl border p-5 sm:p-8'
          }
        >
          {campaign === 'bulin' && (
            <div
              className="trend-effect-selector flex w-full gap-2"
              role="radiogroup"
              aria-label={m['effect.selector_label']()}
            >
              {(
                [
                  { value: 'solo', label: m['effect.solo.title']() },
                  { value: 'trio', label: m['effect.trio.title']() },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={effect === option.value}
                  onClick={() => selectEffect(option.value)}
                  className={`h-10 flex-1 rounded-full border px-4 text-sm font-medium transition-colors sm:h-11 ${
                    effect === option.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <fieldset disabled={busy} className="trend-upload-step space-y-3">
            <legend className="mb-3 flex items-center gap-3 font-medium">
              <Step number={1} />
              {m['trend.upload_step']()}
            </legend>
            <div
              className={
                campaign === 'bulin'
                  ? isTrio
                    ? 'trend-demo-row trend-demo-row--trio'
                    : 'trend-demo-row trend-demo-row--solo'
                  : undefined
              }
            >
              {campaign === 'bulin' && (
                <figure className="overflow-hidden rounded-xl border">
                  <EffectDemoPreview
                    src={isTrio ? TRIO_DEMO.src : SOLO_DEMO.src}
                    poster={isTrio ? TRIO_DEMO.poster : SOLO_DEMO.poster}
                    trio={isTrio}
                    label={
                      isTrio
                        ? m['effect.trio.demo_caption']()
                        : m['effect.solo.demo_caption']()
                    }
                  />
                  <figcaption className="text-muted-foreground shrink-0 px-3 py-2 text-xs">
                    {isTrio
                      ? m['effect.trio.demo_caption']()
                      : m['effect.solo.demo_caption']()}
                  </figcaption>
                </figure>
              )}
              <div
                className={
                  campaign === 'bulin' ? 'trend-upload-pane' : undefined
                }
              >
                {isTrio ? (
                  <div className="grid w-full grid-cols-3 gap-3">
                    {(
                      [
                        {
                          slot: 'left',
                          label: m['effect.trio.left'](),
                          required: false,
                        },
                        {
                          slot: 'center',
                          label: m['effect.trio.center'](),
                          required: true,
                        },
                        {
                          slot: 'right',
                          label: m['effect.trio.right'](),
                          required: false,
                        },
                      ] as const
                    ).map(({ slot, label, required }) => {
                      const item = trioSlots[slot];
                      return (
                        <div key={slot} className="space-y-2">
                          <p className="text-center text-xs font-medium">
                            {label}{' '}
                            <span className="text-muted-foreground">
                              {required
                                ? m['effect.trio.required']()
                                : m['effect.trio.optional']()}
                            </span>
                          </p>
                          {item ? (
                            <div className="bg-muted relative aspect-[3/4] overflow-hidden rounded-xl border">
                              <img
                                src={item.url}
                                alt={item.name}
                                className="size-full object-cover"
                              />
                              <button
                                type="button"
                                aria-label={m['create.remove_image']()}
                                onClick={() => {
                                  photosTouched.current = true;
                                  setTrioSlots((current) => {
                                    releasePreview(current[slot]);
                                    const next = { ...current };
                                    delete next[slot];
                                    return next;
                                  });
                                }}
                                className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-black/65 text-white focus-visible:ring-2"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openFilePicker(slot)}
                              className="bg-muted/30 hover:bg-muted/60 flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-2 transition-colors"
                            >
                              {upload.isPending &&
                              uploadTarget.current === slot ? (
                                <Loader2 className="text-primary size-6 animate-spin" />
                              ) : (
                                <ImagePlus className="text-primary size-6" />
                              )}
                              <span className="text-xs font-medium">
                                {m['create.upload_action']()}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid w-full grid-cols-1 gap-3">
                    {references.map((item, index) => (
                      <div
                        key={item.url}
                        className={`bg-muted relative overflow-hidden rounded-xl border ${embedded ? 'trend-upload-box h-full' : 'aspect-[4/3]'}`}
                      >
                        <img
                          src={item.url}
                          alt={item.name}
                          className="size-full object-contain"
                        />
                        <button
                          type="button"
                          aria-label={m['create.remove_image']()}
                          onClick={() => {
                            photosTouched.current = true;
                            setReferences((current) => {
                              releasePreview(current[index]);
                              return current.filter(
                                (_, position) => position !== index
                              );
                            });
                          }}
                          className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-black/65 text-white focus-visible:ring-2"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    {references.length < 1 && (
                      <button
                        type="button"
                        onClick={() => openFilePicker('solo')}
                        className={`bg-muted/30 hover:bg-muted/60 flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 transition-colors ${embedded ? 'trend-upload-box' : ''}`}
                      >
                        {upload.isPending ? (
                          <Loader2 className="text-primary size-7 animate-spin" />
                        ) : (
                          <ImagePlus className="text-primary size-7" />
                        )}
                        <span className="text-sm font-medium">
                          {upload.isPending
                            ? m['agent.composer.uploading']()
                            : m['create.upload_action']()}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {m['create.upload_formats']()}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label={m['create.upload_action']()}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) selectFiles([file]);
                event.target.value = '';
              }}
            />
            <p className="text-muted-foreground text-sm leading-relaxed">
              {peeper
                ? m['effect.peeper.photo_hint']()
                : campaign === 'bridges'
                  ? m['effect.bridges.photo_hint']()
                  : isTrio
                    ? m['effect.trio.photo_hint']()
                    : m['effect.bulin.photo_hint']()}
            </p>
            {hasPhoto && (
              <p
                role="status"
                className="trend-cyan flex items-center gap-2 text-xs"
              >
                <Check className="size-3.5" />
                {m['effect.photo_ready']()}
              </p>
            )}
            {uploadError && (
              <p role="alert" className="text-destructive text-sm">
                {uploadError}
              </p>
            )}
          </fieldset>
          <div className="trend-settings-step space-y-4">
            <div className="trend-preset rounded-xl border px-4 py-3 text-sm leading-6">
              <p className="flex items-center gap-2 font-medium">
                <Check className="size-4 shrink-0" />
                {peeper
                  ? m['effect.peeper.source_ready']()
                  : campaign === 'bridges'
                    ? m['effect.bridges.source_ready']()
                    : isTrio
                      ? m['effect.trio.source_ready']()
                      : m['effect.bulin.source_ready']()}
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-6">
                {peeper
                  ? m['effect.peeper.scene']()
                  : campaign === 'bridges'
                    ? m['effect.bridges.scene']()
                    : isTrio
                      ? m['effect.trio.scene']()
                      : m['effect.bulin.scene']()}
              </p>
            </div>
            <fieldset disabled={busy}>
              <legend className="mb-3 flex items-center gap-3 font-medium">
                <Step number={2} />
                {m['effect.settings_title']()}
              </legend>
              <details
                className="border-border rounded-xl border"
                open={embedded ? true : undefined}
              >
                <summary className="trend-settings-summary flex min-h-16 cursor-pointer list-none items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {model.tier} · {settings.resolution} · {pricedDuration}s ·{' '}
                      {pricedAspectRatio === 'auto'
                        ? m['create.auto_ratio']()
                        : pricedAspectRatio}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {m['create.quality_hint']()}
                    </span>
                  </div>
                  <span className="text-primary shrink-0 text-sm font-semibold">
                    {m['create.cost']({ count: cost })}
                  </span>
                  <ChevronDown className="size-4 shrink-0" />
                </summary>
                <div className="trend-setting-options grid grid-cols-2 gap-4 border-t p-4">
                  <Setting
                    pills={embedded}
                    label={m['create.model']()}
                    value={settings.modelOption}
                    onChange={(value) =>
                      isSelectableModelOption(value) &&
                      setSettings(
                        settingsForModel(
                          { ...settings, modelOption: value },
                          value
                        )
                      )
                    }
                    options={availableModels.map((item) => ({
                      value: item.value,
                      label: `${item.tier} · ${item.label}`,
                    }))}
                  />
                  <Setting
                    pills={embedded}
                    label={m['create.resolution']()}
                    value={settings.resolution}
                    onChange={(value) =>
                      setSettings({ ...settings, resolution: value })
                    }
                    options={resolutionsForModel(settings.modelOption).map(
                      (value) => ({ value, label: value })
                    )}
                  />
                  {isTrio ? (
                    <>
                      <Setting
                        pills={embedded}
                        label={m['create.duration']()}
                        value={String(settings.duration)}
                        onChange={(value) =>
                          setSettings({
                            ...settings,
                            duration: Number(value),
                          })
                        }
                        options={durationsForModel(settings.modelOption).map(
                          (value) => ({
                            value: String(value),
                            label: `${value}s`,
                          })
                        )}
                      />
                      <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs leading-5">
                        <span className="font-medium">
                          {m['create.auto_ratio']()}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {m['effect.trio.fixed_output']()}
                        </span>
                      </div>
                    </>
                  ) : peeper ? (
                    referenceOutputLocked ? (
                      <div className="bg-muted/40 col-span-2 rounded-lg px-3 py-2 text-xs leading-5">
                        <span className="font-medium">
                          15s · {m['create.auto_ratio']()}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {m['effect.peeper.ultra_output']()}
                        </span>
                      </div>
                    ) : (
                      <>
                        <Setting
                          pills={embedded}
                          label={m['create.duration']()}
                          value={String(settings.duration)}
                          onChange={(value) =>
                            setSettings({
                              ...settings,
                              duration: Number(value),
                            })
                          }
                          options={durationsForModel(settings.modelOption).map(
                            (value) => ({
                              value: String(value),
                              label: `${value}s`,
                            })
                          )}
                        />
                        <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs leading-5">
                          <span className="font-medium">9:16</span>
                          <span className="text-muted-foreground">
                            {' '}
                            · {m['effect.peeper.fixed_output']()}
                          </span>
                        </div>
                      </>
                    )
                  ) : campaign === 'bridges' ? (
                    <div className="bg-muted/40 col-span-2 rounded-lg px-3 py-2 text-xs leading-5">
                      <span className="font-medium">
                        15s ·{' '}
                        {referenceOutputLocked
                          ? m['create.auto_ratio']()
                          : '16:9'}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {m['effect.bridges.fixed_output']()}
                      </span>
                    </div>
                  ) : referenceOutputLocked ? null : (
                    <>
                      <Setting
                        pills={embedded}
                        label={m['create.duration']()}
                        value={String(settings.duration)}
                        onChange={(value) =>
                          setSettings({
                            ...settings,
                            duration: Number(value),
                          })
                        }
                        options={durationsForModel(settings.modelOption).map(
                          (value) => ({
                            value: String(value),
                            label: `${value}s`,
                          })
                        )}
                      />
                      <Setting
                        pills={embedded}
                        label={m['create.ratio']()}
                        value={settings.aspectRatio}
                        onChange={(value) =>
                          setSettings({ ...settings, aspectRatio: value })
                        }
                        options={aspectRatiosForModel(settings.modelOption).map(
                          (value) => ({
                            value,
                            label:
                              value === 'auto'
                                ? m['create.auto_ratio']()
                                : value,
                          })
                        )}
                      />
                    </>
                  )}
                </div>
                <p className="text-muted-foreground px-4 pb-4 text-xs">
                  {m['create.price_hint']()}
                </p>
              </details>
            </fieldset>
          </div>
          <div className="trend-console-footer space-y-3">
            <p className="flex items-center gap-3 font-medium">
              <Step number={3} />
              {m['effect.submit_title']()}
            </p>
            <Button
              type="submit"
              disabled={busy}
              className={`h-12 w-full gap-2 rounded-xl text-base ${
                hasPhoto && !busy ? 'photo-ready-cta' : ''
              }`}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              {busy
                ? m['create.generating']()
                : !hasPhoto
                  ? m['effect.add_photo_cta']()
                  : m['effect.generate_with_photo']()}
            </Button>
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {m['proof.quality']({
                  videos: formatProofNumber(QUALITY_PROOF_VIDEOS, locale),
                  rounds: formatProofNumber(QUALITY_PROOF_ROUNDS, locale),
                })}
              </p>
              {typeof generatedCount === 'number' && (
                <p className="text-primary text-lg leading-snug font-bold tracking-tight text-balance">
                  {m['proof.generated']({
                    count: formatProofNumber(generatedCount, locale),
                  })}
                </p>
              )}
            </div>
            {generate.isError && (
              <p role="alert" className="text-destructive text-sm">
                {generate.error.message}
              </p>
            )}
            <p className="text-center text-sm">
              {m['create.cost']({ count: cost })}
              {signedIn && (
                <span className="text-muted-foreground">
                  {' '}
                  ·{' '}
                  {credits.data
                    ? m['create.balance']({ count: credits.data.balance })
                    : '…'}
                </span>
              )}
            </p>
            {monthly && (
              <button
                type="button"
                onClick={() => {
                  if (signedIn) {
                    setPurchaseExperimentScene(undefined);
                    setPurchaseOpen(true);
                  } else {
                    promptAuth('purchase');
                  }
                }}
                className="text-primary block w-full text-center text-sm underline underline-offset-4"
              >
                {m['create.plan_hint']({
                  count: Math.floor(monthly.credits / cost),
                  price: new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: monthly.currency,
                  }).format(monthly.priceInCents / 100),
                })}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (signedIn) {
                  setPurchaseExperimentScene(undefined);
                  setPurchaseOpen(true);
                } else {
                  promptAuth('purchase');
                }
              }}
              className="text-muted-foreground block min-h-11 w-full text-center text-sm underline underline-offset-4"
            >
              {m['create.buy_credits']()}
            </button>
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              {m['create.permission']()}{' '}
              <Link href="/terms-of-service" className="underline">
                {m['create.terms']()}
              </Link>
            </p>
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
              <Check className="size-3.5 shrink-0" />
              {m['create.reassurance']()}
            </p>
          </div>
        </form>

        {signedIn && activeTasks.length > 0 && (
          <section
            aria-label={m['create.active_tasks']()}
            className="mx-auto mt-10 max-w-5xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {m['create.active_tasks']()}
              </h2>
              <Link
                href="/library"
                className="text-primary text-sm underline underline-offset-4"
              >
                {m['create.task_history']()}
              </Link>
            </div>
            {tasksQuery.isError && (
              <div role="alert" className="text-destructive mb-4 text-sm">
                {m['create.tasks_error']()}{' '}
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void tasksQuery.refetch()}
                >
                  {m['create.retry']()}
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeTasks.map((task) => (
                <CreateTaskCard
                  key={task.id}
                  task={task}
                  costLabel={m['create.cost']({ count: task.costCredits })}
                  sourceLabels={{
                    video: m['create.reference_video'](),
                    audio: m['create.soundtrack'](),
                    from7s: m['create.media_from_7s'](),
                    from4s: m['create.media_from_4s'](),
                    bridgesVideo: m['effect.bridges.reference_label'](),
                    bridgesAudio: m['effect.bridges.audio_label'](),
                    peeperVideo: m['effect.peeper.reference_label'](),
                    peeperAudio: m['effect.peeper.audio_label'](),
                    trioVideo: m['effect.trio.reference_label'](),
                    trioAudio: m['effect.trio.audio_label'](),
                  }}
                  labels={{
                    pending: m['create.task_pending'](),
                    processing: m['create.task_processing'](),
                    success: m['create.task_success'](),
                    failed: m['create.task_failed'](),
                    canceled: m['create.task_canceled'](),
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
      {purchaseOpen ? (
        <Suspense fallback={null}>
          <CreditPurchaseDialog
            open={purchaseOpen}
            onOpenChange={(open) => {
              setPurchaseOpen(open);
              if (!open) setPurchaseExperimentScene(undefined);
              if (!open && retentionTrigger.current) {
                retentionTrigger.current = false;
                if (signedIn && hasPhoto && insufficient)
                  window.dispatchEvent(
                    new CustomEvent(VIDEO_RETENTION_EVENT, {
                      detail: {
                        campaign,
                        modelOption: settings.modelOption,
                        duration: pricedDuration,
                        resolution: settings.resolution,
                        image: primaryPhoto?.url,
                      },
                    })
                  );
              }
            }}
            redirect={returnPath}
            experimentScene={purchaseExperimentScene}
            placement={
              purchaseExperimentScene === CREDIT_PAYWALL_SCENE
                ? 'credit-insufficient'
                : 'create'
            }
            context={{
              title: m['create.purchase_context_title'](),
              description: m['create.purchase_context_description']({
                credits: cost,
              }),
              image: primaryPhoto?.url,
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function Step({ number }: { number: number }) {
  return (
    <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm">
      {number}
    </span>
  );
}
function Setting({
  label,
  value,
  onChange,
  options,
  pills = false,
}: {
  pills?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  if (pills) {
    return (
      <fieldset className="trend-setting-group min-w-0">
        <legend className="text-muted-foreground mb-2 text-xs">{label}</legend>
        <div className="trend-setting-pills">
          {options.map((option) => (
            <label
              key={option.value}
              className={`trend-setting-pill ${option.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <input
                type="radio"
                name={label}
                value={option.value}
                checked={value === option.value}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="space-y-2 text-sm">
      <span className="block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-background border-input focus-visible:ring-ring h-11 w-full rounded-lg border px-2 text-sm focus-visible:ring-2"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
