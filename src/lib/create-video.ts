import { z } from 'zod';

import {
  AGENT_MODEL_OPTIONS,
  creditsForGeneration,
  generationDurationSeconds,
  isSelectableModelOption,
  normalizeClientGenerationSettings,
} from '@/lib/agent-settings';
import {
  BULIN_FIXED_MEDIA_VERSION,
  BULIN_REFERENCE_VIDEOS,
  supportsBulinReferenceVideo,
  type BulinMediaVersion,
} from '@/lib/bulin-reference';
import {
  TRIO_REFERENCE_VIDEOS,
  trioVersionForDuration,
  type TrioMediaVersion,
} from '@/lib/bulin-trio-reference';
import {
  BURNING_BRIDGES_MEDIA_VERSION,
  BURNING_BRIDGES_REFERENCE,
  type BurningBridgesMediaVersion,
} from '@/lib/burning-bridges-reference';
import {
  requireWindowPeeperReference,
  WINDOW_PEEPER_MEDIA_VERSION,
  type WindowPeeperMediaVersion,
} from '@/lib/window-peeper-reference';

const BULIN_REFERENCE_PROMPT =
  'Replace the source performer’s complete visible appearance with the person in @Image1 throughout the entire @Video1 clip. @Image1 is the sole authority for identity and appearance: face, skin tone, hair, body shape, clothing, jewelry, glasses, and every accessory. @Video1 is the sole authority for performance and scene: preserve the original actions, choreography, posture, gestures, hand placement, head movement, gaze, facial expression, and exact mouth and lip movement frame by frame. The generated video’s very first frame must already show the replacement person; do not show the source performer in even one opening frame. This applies to the first two seconds even while the performer is partly blocked and only a partial back view, silhouette, or small body region is visible: replace every visible performer pixel and every exposed part of the head, hair, skin, body, and clothing with the corresponding appearance of the person in @Image1. Do not leave the source performer’s original back, outline, clothes, or body visible around or behind the occluder. Keep genuine foreground objects and people in front of the performer, matching the original occlusion and depth order exactly; replace the performer in the visible regions around them. Apply the replacement before any turn or face reveal and keep it active through the final frame, with special care not to lose the replacement in the latter half. Never leave any part of the source performer recognizable or unchanged—not in opening or transition frames, partial views, reflections, or brief occlusions. Replace the whole head and person, not only the face. Maintain the same identity at every angle, including front, three-quarter, profile, looking down, turning away, and rear views; when the face is not visible, show the replacement person’s matching hair, head, body, clothing, and accessories from that angle. A turn changes only the pose and view, never the person. Do not copy the source performer’s clothes or accessories. Match the replacement person’s outfit and accessories to @Image1 in every frame. If the source performer wears sunglasses or another accessory that is absent from @Image1, remove it and show the replacement person’s unobstructed face while keeping the original head movement and expression. Preserve the original mouth state and lip motion exactly: if the source performer’s mouth is closed or still, keep it closed or still; if it moves, reproduce only that same movement at the same time. The soundtrack is background audio, not dialogue from the visible performer. Never make the performer speak, sing, lip-sync, or move their mouth in response to music, lyrics, vocals, or beat changes. This mouth-motion rule applies equally to the latter half. Match the source video’s complete visual structure exactly from the first frame to the last: same scene and background, shot sequence, camera movement, framing, composition, rhythm, pacing, timing, transitions, and every cut at its original point. Do not add, remove, reorder, extend, shorten, or reinterpret any shot or transition. Preserve lighting, other people, objects, and genuine foreground occlusions. Keep realistic skin texture and scene-matched motion blur. No source-face frames, delayed replacement, face blending, identity drift, flicker, wardrobe changes, extra people, new cuts, text, or logos. Do not alter or invent any action. Ignore music, lyrics, vocals, and beat changes when deciding what the performer does. Generate no audio; the selected original soundtrack will be added after rendering.';

const publicImageUrl = z.url().refine((url) => {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
}, 'Upload images to public storage first');

export const trioSlotsSchema = z
  .object({
    left: publicImageUrl.optional(),
    center: publicImageUrl,
    right: publicImageUrl.optional(),
  })
  .strict();
export type TrioSlots = z.infer<typeof trioSlotsSchema>;

/** Ordered reference images for a trio job: [left?, center, right?]. */
export function trioOrderedImages(slots: TrioSlots): string[] {
  return [slots.left, slots.center, slots.right].filter(
    (url): url is string => !!url
  );
}

export const createVideoSchema = z
  .object({
    campaign: z.enum(['bulin', 'bridges', 'peeper']),
    take: z.number().int().min(0).max(2),
    effect: z.enum(['solo', 'trio']).optional(),
    slots: trioSlotsSchema.optional(),
    images: z.array(publicImageUrl).min(1).max(3),
    settings: z
      .object({
        modelName: z.string().refine(isSelectableModelOption),
        aspectRatio: z.string(),
        resolution: z.string(),
        duration: z.number().int(),
        audioMode: z.enum(['model', 'silent', 'mute_after']).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.campaign === 'bridges' &&
      (value.settings.duration !== BURNING_BRIDGES_REFERENCE.durationSeconds ||
        (value.settings.modelName !== 'seedance-2-5' &&
          value.settings.aspectRatio !== '16:9'))
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Burning Bridges uses the source clip’s fixed 15-second 16:9 format.',
        path: ['settings'],
      });
    }
    if (
      (value.campaign === 'bridges' || value.campaign === 'peeper') &&
      !value.settings.modelName.startsWith('seedance-2')
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          value.campaign === 'peeper'
            ? 'Window Peeper requires a Seedance model for reference-video input.'
            : 'Burning Bridges requires a Seedance model for reference-video input.',
        path: ['settings', 'modelName'],
      });
    }
    const isTrio = value.campaign === 'bulin' && value.effect === 'trio';
    if (value.effect === 'trio' && !isTrio) {
      ctx.addIssue({
        code: 'custom',
        message: 'The trio effect is only available for Bulin.',
        path: ['effect'],
      });
    }
    if (!isTrio && value.images.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'This effect uses one photo.',
        path: ['images'],
      });
    }
    if (isTrio) {
      if (!value.slots) {
        ctx.addIssue({
          code: 'custom',
          message: 'Trio requires photo slots with a center photo.',
          path: ['slots'],
        });
      } else if (
        JSON.stringify(trioOrderedImages(value.slots)) !==
        JSON.stringify(value.images)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Trio images must match the left/center/right slots.',
          path: ['images'],
        });
      }
      if (!value.settings.modelName.startsWith('seedance-2')) {
        ctx.addIssue({
          code: 'custom',
          message: 'Trio requires a Seedance model for reference-video input.',
          path: ['settings', 'modelName'],
        });
      }
    }
    if (value.campaign === 'bulin' && !isTrio) {
      if (
        !supportsBulinReferenceVideo(
          value.settings.modelName,
          BULIN_FIXED_MEDIA_VERSION
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message:
            'This reference video exceeds the selected model’s input limit. Select Seedance 2.5.',
          path: ['referenceVideoVersion'],
        });
      }
    }
    const model = AGENT_MODEL_OPTIONS.find(
      (item) => item.value === value.settings.modelName
    );
    if (!model) return;
    const { aspectRatio, resolution, duration } = value.settings;
    if (
      !(model.aspectRatios as readonly string[]).includes(aspectRatio) ||
      !(model.resolutions as readonly string[]).includes(resolution) ||
      !(model.durations as readonly number[]).includes(duration)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Unsupported video settings',
        path: ['settings'],
      });
    }
  });

const WINDOW_PEEPER_PROMPT =
  'Replace the person visible in the lit window of @Video1 with the person in @Image1. @Image1 is the sole authority for who the person is: face, skin tone, hair, body shape, clothing, and accessories. @Video1 is the sole authority for camera, scene, and timing: preserve the night street, the dark apartment block, the one lit window, the curtain, the table, and the food packaging exactly as in @Video1. The replacement person must already be present in the first frame where someone is visible in that window and must remain that same person through the bite, the stare, and the curtain. Do not copy the source person’s clothes when they differ from @Image1. These beats are required in order; do not drop the eating or replace the burger with another action. 0.0–2.0s: night, a dark apartment block with one lit window, and the camera starts to push in. 2.0–3.0s: the push-in lands, the lit window fills the frame, and a curtain hangs on one side. 3.0–5.0s: the person sits at the table and takes a big bite of a burger, unaware of the camera. 5.0–11.0s: mid-chew they freeze, look straight into the lens, and chew slowly; nobody blinks. 11.0–12.0s: they put the food down, stand up, and step to the window. 12.0–14.0s: one hard pull closes the curtain and the window goes dark. The requested duration is authoritative. On a 12-second output, keep this order and fit the zoom, the bite, the stare, and the start of the curtain inside those 12 seconds. On a 15-second output, keep this about-14-second timing and hold the dark closed window. Do not invent unrelated actions. One person only. No extra people, text, logos, or identity drift. After rendering, the original Window Peeper soundtrack is added and trimmed to the clip. Do not invent speech, singing, or lip-sync.';

export function parseCreateVideoInput(input: unknown) {
  const parsed = createVideoSchema.parse(input);
  const peeperReference =
    parsed.campaign === 'peeper' ? requireWindowPeeperReference() : null;
  const settings = normalizeClientGenerationSettings(parsed.settings)!;
  const isTrio = parsed.campaign === 'bulin' && parsed.effect === 'trio';
  const trioVersion = isTrio
    ? trioVersionForDuration(settings.duration ?? 12)
    : undefined;
  const referenceVideoDurationSeconds = peeperReference
    ? peeperReference.durationSeconds
    : parsed.campaign === 'bridges'
      ? BURNING_BRIDGES_REFERENCE.durationSeconds
      : isTrio
        ? TRIO_REFERENCE_VIDEOS[trioVersion!].durationSeconds
        : BULIN_REFERENCE_VIDEOS[BULIN_FIXED_MEDIA_VERSION].durationSeconds;
  settings.referenceVideoDurationSeconds = referenceVideoDurationSeconds;
  if (isTrio) settings.referenceOutputSeconds = referenceVideoDurationSeconds;
  // Create always attaches a reference clip. Seedance 2.5 follows that clip,
  // so a stale 12-second picker value cannot underprice the 15-second output,
  // and a 9:16 or 16:9 picker value cannot override Kie's adaptive ratio.
  settings.duration = generationDurationSeconds(
    settings.modelName,
    settings.duration,
    true,
    referenceVideoDurationSeconds
  );
  if (settings.modelName === 'seedance-2-5' || isTrio)
    settings.aspectRatio = 'auto';
  settings.creditCost = creditsForGeneration(
    settings.modelName,
    settings.duration,
    settings.resolution
  );
  return {
    ...parsed,
    effect: (parsed.effect ?? 'solo') as 'solo' | 'trio',
    referenceVideoVersion:
      parsed.campaign === 'peeper'
        ? WINDOW_PEEPER_MEDIA_VERSION
        : parsed.campaign === 'bridges'
          ? BURNING_BRIDGES_MEDIA_VERSION
          : isTrio
            ? trioVersion!
            : BULIN_FIXED_MEDIA_VERSION,
    soundtrackVersion:
      parsed.campaign === 'peeper'
        ? WINDOW_PEEPER_MEDIA_VERSION
        : parsed.campaign === 'bridges'
          ? BURNING_BRIDGES_MEDIA_VERSION
          : isTrio
            ? trioVersion!
            : BULIN_FIXED_MEDIA_VERSION,
    prompt: isTrio
      ? buildTrioPrompt(parsed.slots!)
      : parsed.campaign === 'bulin'
        ? BULIN_REFERENCE_PROMPT
        : parsed.campaign === 'peeper'
          ? WINDOW_PEEPER_PROMPT
          : TREND_PROMPTS[parsed.campaign][parsed.take]!,
    settings,
  };
}

/**
 * Trio prompt: complete person replacement (not face swap) for up to three
 * dancers. `@ImageN` numbering follows the ordered images actually sent
 * ([left?, center, right?]), so the mapping is rebuilt per combination.
 * Missing side dancers are invented with the center dancer's broad ethnic
 * appearance. Solo prompt above stays untouched.
 */
export function buildTrioPrompt(slots: TrioSlots): string {
  const entries: { slot: 'left' | 'center' | 'right'; label: string }[] = [];
  if (slots.left) entries.push({ slot: 'left', label: 'LEFT' });
  entries.push({ slot: 'center', label: 'CENTER' });
  if (slots.right) entries.push({ slot: 'right', label: 'RIGHT' });
  const mapping = entries
    .map(
      (entry, index) =>
        `@Image${index + 1} is the ${entry.label} dancer${
          entry.slot === 'center'
            ? ' — the lead in the middle of the formation'
            : `, who stays on the viewer's ${entry.slot} for the entire clip`
        }.`
    )
    .join(' ');
  const generated: string[] = [];
  if (!slots.left)
    generated.push(
      'No photo is provided for the LEFT dancer: invent one original fictional adult companion with the same broad ethnic appearance and skin tone as the CENTER dancer, a clearly different face, hairstyle and outfit from both other dancers, and a similar age range; keep this invented person identical in every frame.'
    );
  if (!slots.right)
    generated.push(
      'No photo is provided for the RIGHT dancer: invent one original fictional adult companion with the same broad ethnic appearance and skin tone as the CENTER dancer, a clearly different face, hairstyle and outfit from both other dancers, and a similar age range; keep this invented person identical in every frame.'
    );
  return [
    'Replace all three source performers in @Video1 with the people defined below. This is complete person replacement, not face swap: each replacement person’s face, skin tone, hair, body shape, complete outfit, clothing, shoes, jewelry, glasses and every accessory come entirely from their assigned reference image and must match that image in every frame; never copy any source performer’s clothes, hat or accessories onto them.',
    `Position mapping is fixed for the whole clip and must never change: ${mapping}`,
    'The CENTER dancer is the lead: keep the center choreography exactly as in @Video1, including the crouch down at about 6–7 seconds and the walk toward the camera at about 8–11 seconds, then the return to the trio formation for the finish. The LEFT and RIGHT dancers keep their own side choreography from @Video1 and never walk to the camera, never trade places, and never cross into the center position, even when the center dancer moves forward and partly covers them.',
    'Identity isolation is absolute: each face, hairstyle and outfit belongs to one dancer only — never blend two reference people, never put one person’s face or clothing on another’s body, and never make two dancers look like the same person.',
    ...generated,
    '@Video1 is the sole authority for performance and scene: preserve the grey roller-shutter background, pavement, lighting, static camera, framing, composition, timing, every action, gesture, head movement, gaze and expression frame by frame, from the first frame to the last. All three replacements must already be present in the very first frame; do not show any source performer, or any part of them, in any frame, including partial views, occlusions and the moments when dancers overlap. Keep the original occlusion and depth order exactly. No extra people, no missing dancer, no duplicates, no identity drift, no flicker, no wardrobe changes, no text or logos.',
    'The soundtrack is background audio, not dialogue: no performer speaks, sings or lip-syncs to it; preserve each source dancer’s original mouth state and movement only. Realistic skin texture, scene-matched motion blur. Generate no audio; the selected original soundtrack will be added after rendering.',
  ].join(' ');
}

/** Prompts stay on the server so the preset flow never asks users to write one. */
const TREND_PROMPTS: Record<'bulin' | 'bridges', readonly string[]> = {
  bulin: [
    'Use the uploaded portrait as the identity reference for one lead performer. Keep their facial features, hairstyle and body proportions consistent throughout. Create a new night-time sidewalk freestyle scene outside a restaurant with red doorway lighting. The lead wears a pink shirt, faces the phone camera and begins with a small shoulder bounce, then makes relaxed rhythmic hand gestures and ends with a confident nod. A distinct supporting guest holds a compact portable speaker beside the lead; a small crowd reacts behind them. Keep the supporting faces different from the lead. One continuous medium handheld shot with the lead face and upper body clearly visible. Natural coherent movement, no cuts, no text or logos. Prioritize identity consistency over complex choreography.',
    'Place the person in the uploaded portrait at the center of a sidewalk freestyle cypher. A speaker-holder stands nearby and a loose crowd reacts in the background. The lead takes one step forward, nods to the beat and turns slightly toward the onlookers. Use a gentle camera push in a continuous medium-wide shot, with red-tinted night lighting and natural movement.',
    'Show the person in the uploaded portrait leading a street freestyle moment at night. They give confident, natural hand gestures and a subtle shoulder bounce while friends react behind them. Keep a steady medium shot with light handheld movement, an unobstructed face, deep red doorway light and a candid phone-video look.',
  ],
  bridges: [
    'Replace the complete visible appearance of the lead performer in @Video1 with the person shown in @Image1. @Image1 is the sole authority for replacement identity and appearance: face, skin tone, hair, hairstyle, body shape, clothing, jewelry, glasses and all accessories. @Video1 is the sole authority for performance, scene and editing. The replacement must already be present in the very first frame, including the opening partial back view and any moment when the lead is blocked by guests or foreground objects. Replace every visible part of the performer, including hair, head, skin, body and clothes; do not leave any recognizable source-person pixels, silhouette, outfit or accessories. Preserve real foreground occlusions and their depth order. Maintain the replacement through every angle, turn, profile, rear view, transition and the final frame. A turn changes only pose and view, never identity. Match the portrait’s exact outfit and accessories in every frame; do not copy the source performer’s clothes, jewelry, eyewear or accessories when they differ from @Image1. Follow the source performance frame by frame: preserve the same actions, choreography, posture, gestures, hand placement, object interactions, head turns, gaze, expressions, mouth shapes and lip movement at the same timing. Preserve every camera move, composition, shot, cut, transition, scene, background, guest, prop, rhythm, pacing and duration exactly as in @Video1. Do not add, remove, reorder, extend, shorten or reinterpret anything. Keep other people distinct and unchanged. Match source lighting, shadows, motion blur, depth of field, grain and compression; retain natural skin texture and stable facial features. No delayed replacement, identity drift, flicker, face blending, wardrobe changes, extra people, text, logos or invented actions. Generate no audio. After rendering, the original audio extracted from the same 15-second source segment will be muxed unchanged.',
  ],
} as const;

export interface CreateVideoTask {
  id: string;
  status: string;
  prompt: string;
  model: string;
  costCredits: number;
  createdAt: string;
  files: string[];
  imagePreview?: string;
  referenceVideoVersion?:
    | BulinMediaVersion
    | BurningBridgesMediaVersion
    | TrioMediaVersion
    | WindowPeeperMediaVersion;
  soundtrackVersion?:
    | BulinMediaVersion
    | BurningBridgesMediaVersion
    | TrioMediaVersion
    | WindowPeeperMediaVersion;
  error?: string;
}
