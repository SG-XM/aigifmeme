/**
 * I'm So Sorry / Perdón photo-set prompts and captions.
 *
 * Caption strings and lie order are the published Perdon catalog. The last
 * selected lie is revealed by the original photo and has no confession line.
 * That is what produces the Halloween chain (wig, costume, party confessed;
 * makeup silent) and the childhood, baby, pet, and sports sets.
 *
 * A generic hair → outfit → grooming → background reorder would confess
 * makeup instead of the party, and would confess blonde before the house.
 * Subsets keep this catalog order and drop the lies the user did not pick.
 * The published priority (hair, then costume, then grooming, then the
 * background) is the Halloween removal sequence: wig, costume, party, with
 * makeup held back as the silent last lie.
 *
 * QA gates for every set:
 * 1. Slide 1 and the last slide are the same person or pet (system prefix).
 * 2. Adjacent edited frames change one lie (REMOVE ONLY + one revert).
 * 3. Dream frames must not keep DIY tape, cardboard, or trash bags (slide 1).
 * 4. A named costume includes a color ("pink butterfly", not "butterfly").
 *
 * Sports has no stadium-crowd caption in the catalog. Do not add a stadium
 * visual. "a higher jump" and "pro muscles" are the jump and muscles lies.
 */

export const SORRY_CREDIT_COST = 5;
export const SORRY_SCENE = 'im-so-sorry';
export const SORRY_MODEL = 'google/nano-banana-edit';
export const SORRY_PAGE_UPDATED_AT = '2026-10-23';

export const SORRY_SYSTEM_PREFIX =
  'Edit the provided photo. Keep the SAME person/pet: identical face, age cues, skin tone, body proportions, and camera pose. Photorealistic photo, not illustration. Do NOT add text, watermarks, or logos.';

const CLOSING = { en: "i'm so sorry", es: 'perdón' } as const;

export class SorryRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SorryRequestError';
  }
}

type Copy = { en: string; es: string };

interface LieDef {
  id: string;
  /** hair/fur steps are the only ones allowed to change hair or coat. */
  changes: 'hair' | 'fur' | 'none';
  apply: string;
  revert: string;
  reveal: Copy;
  revealNext: Copy;
  /** Slide-1 clause order. Defaults to catalog order. */
  applyOrder?: number;
}

interface StyleDef {
  id: string;
  dream: string;
  opener: Copy;
  lies: LieDef[];
}

const STYLES: StyleDef[] = [
  {
    id: 'halloween',
    dream: 'Halloween costume',
    opener: {
      en: 'this was my halloween costume',
      es: 'este fue mi disfraz de halloween',
    },
    lies: [
      {
        id: 'wig',
        changes: 'hair',
        apply: 'perfect wig/hair',
        revert: 'replace the perfect wig with a cheap yellow store wig',
        reveal: {
          en: "ok i lied, my wig wasn't that good",
          es: 'mentira, la peluca no era tan buena',
        },
        revealNext: {
          en: "my wig wasn't that good either",
          es: 'tampoco la peluca era tan buena',
        },
      },
      {
        id: 'costume',
        changes: 'none',
        apply: 'expensive store-bought costume fitting perfectly',
        revert:
          'replace the expensive store-bought costume with a cheap costume',
        reveal: {
          en: "ok i lied, my costume wasn't that expensive",
          es: 'mentira, no era tan caro',
        },
        revealNext: {
          en: "my costume wasn't that expensive either",
          es: 'tampoco era tan caro',
        },
      },
      {
        id: 'party',
        changes: 'none',
        apply: 'decorated fancy Halloween party porch, warm evening light',
        revert:
          'replace the decorated fancy Halloween party porch with an ordinary undecorated entrance',
        reveal: {
          en: "ok i lied, it wasn't a fancy party",
          es: 'mentira, no era una fiesta elegante',
        },
        revealNext: {
          en: "and it wasn't a fancy party",
          es: 'ni era una fiesta elegante',
        },
        applyOrder: 3,
      },
      {
        id: 'makeup',
        changes: 'none',
        apply: 'pro makeup',
        revert: 'replace the pro makeup with bare skin',
        reveal: {
          en: "ok i lied, my makeup wasn't that good",
          es: 'mentira, el maquillaje no era así',
        },
        revealNext: {
          en: "and my makeup wasn't that good",
          es: 'ni el maquillaje era así',
        },
        applyOrder: 2,
      },
    ],
  },
  {
    id: 'childhood',
    dream: 'childhood',
    opener: {
      en: 'my mom dressed me up as a princess when i was little',
      es: 'esta soy yo de chiquita en una foto distraída',
    },
    lies: [
      {
        id: 'house',
        changes: 'none',
        apply: 'a mansion',
        revert: 'replace the mansion with the original ordinary room',
        reveal: {
          en: "ok i lied, that wasn't our house",
          es: 'mentira, mi casa no es tan linda',
        },
        revealNext: {
          en: "and that wasn't our house",
          es: 'ni mi casa es tan linda',
        },
      },
      {
        id: 'blonde',
        changes: 'hair',
        apply: 'long, glossy, golden blonde curls',
        revert: 'replace the long golden blonde curls with the original hair',
        reveal: {
          en: "ok i lied, i wasn't blonde",
          es: 'mentira, no soy rubia',
        },
        revealNext: {
          en: "i wasn't blonde either",
          es: 'tampoco soy rubia',
        },
      },
      {
        id: 'candid',
        changes: 'none',
        apply: 'a dreamy candid expression with clean rosy skin',
        revert:
          'replace the dreamy candid expression and rosy skin with the original expression',
        reveal: {
          en: "ok i lied, i wasn't that cute",
          es: 'mentira, no estaba tan distraída',
        },
        revealNext: {
          en: "and i wasn't that cute",
          es: 'ni estaba tan distraída',
        },
      },
      {
        id: 'dress',
        changes: 'none',
        apply: 'a pastel princess dress with lace',
        revert: 'replace the pastel princess dress with the original clothes',
        reveal: {
          en: "ok i lied, that wasn't my dress",
          es: 'mentira, ese no era mi vestido',
        },
        revealNext: {
          en: "that wasn't my dress either",
          es: 'tampoco era mi vestido',
        },
      },
    ],
  },
  {
    id: 'baby',
    dream: 'baby',
    opener: {
      en: 'this was me as a baby',
      es: 'esta soy yo de bebé',
    },
    lies: [
      {
        id: 'hair',
        changes: 'hair',
        apply: 'soft glossy perfectly styled baby curls',
        revert: 'replace the perfect baby curls with the original hair',
        reveal: {
          en: 'ok i lied, i had no hair',
          es: 'mentira, no tenía pelo',
        },
        revealNext: {
          en: "i didn't have that hair either",
          es: 'tampoco tenía ese pelo',
        },
      },
      {
        id: 'outfit',
        changes: 'none',
        apply: 'an expensive spotless designer baby outfit',
        revert: 'replace the designer baby outfit with the original clothes',
        reveal: {
          en: "ok i lied, that wasn't my outfit",
          es: 'mentira, esa no era mi ropa',
        },
        revealNext: {
          en: "that wasn't my outfit either",
          es: 'tampoco era mi ropa',
        },
      },
      {
        id: 'studio',
        changes: 'none',
        apply:
          'a soft professional baby photo studio with a creamy backdrop and gentle lights',
        revert:
          'replace the professional baby photo studio with the original room',
        reveal: {
          en: "ok i lied, it wasn't a photoshoot",
          es: 'mentira, no era una sesión de fotos',
        },
        revealNext: {
          en: "and it wasn't a photoshoot",
          es: 'ni era una sesión de fotos',
        },
      },
      {
        id: 'smile',
        changes: 'none',
        apply: 'a sweet picture-perfect smile',
        revert:
          'replace the picture-perfect smile with the original expression',
        reveal: {
          en: "ok i lied, i wasn't that cute",
          es: 'mentira, no era tan lindo',
        },
        revealNext: {
          en: "and i wasn't that cute",
          es: 'ni era tan lindo',
        },
      },
    ],
  },
  {
    id: 'sports',
    dream: 'sports',
    opener: {
      en: 'this is me on a normal day competing',
      es: 'este soy yo un día cualquiera compitiendo',
    },
    lies: [
      {
        id: 'jump',
        changes: 'none',
        apply: 'a higher jump',
        revert: 'replace the higher jump with the original jump height',
        reveal: {
          en: "ok i lied, i can't jump that high",
          es: 'mentí, no salto tan alto',
        },
        revealNext: {
          en: "and i can't jump that high",
          es: 'ni salto tan alto',
        },
      },
      {
        id: 'muscles',
        changes: 'none',
        apply: 'pro muscles',
        revert: 'replace the pro muscles with the original build',
        reveal: {
          en: "ok i lied, i'm not that strong",
          es: 'mentí, no tengo tantos músculos',
        },
        revealNext: {
          en: "i'm not that strong either",
          es: 'tampoco tengo tantos músculos',
        },
      },
      {
        id: 'blonde',
        changes: 'hair',
        apply: 'bright golden blonde hair',
        revert: 'replace the bright golden blonde hair with the original hair',
        reveal: {
          en: "ok i lied, i'm not blonde",
          es: 'mentí, no soy rubio',
        },
        revealNext: {
          en: "i'm not blonde either",
          es: 'ni soy rubio',
        },
      },
      {
        id: 'kit',
        changes: 'none',
        apply: 'a brand-new professional competition kit',
        revert:
          'replace the professional competition kit with the original clothes',
        reveal: {
          en: "ok i lied, that's not my kit",
          es: 'mentí, ese no es mi uniforme',
        },
        revealNext: {
          en: "that's not my kit either",
          es: 'tampoco es mi uniforme',
        },
      },
    ],
  },
  {
    id: 'pet',
    dream: 'pet',
    opener: {
      en: 'this is my dog posing',
      es: 'este es mi perro posando',
    },
    lies: [
      {
        id: 'fluffy',
        changes: 'fur',
        apply: 'fluffy show-groomed fur',
        revert: 'replace the fluffy show-groomed fur with the original coat',
        reveal: {
          en: "ok i lied, he's not that fluffy",
          es: 'mentira, no es tan peludo',
        },
        revealNext: {
          en: "he's not that fluffy either",
          es: 'tampoco es tan peludo',
        },
      },
      {
        id: 'bow',
        changes: 'none',
        apply: 'a big satin bow',
        revert: 'remove the big satin bow',
        reveal: {
          en: "ok i lied, he doesn't wear bows",
          es: 'mentira, no usa moño',
        },
        revealNext: {
          en: "he doesn't wear bows either",
          es: 'tampoco usa moño',
        },
      },
      {
        id: 'bed',
        changes: 'none',
        apply: 'a luxury velvet pet bed',
        revert: 'replace the luxury velvet pet bed with the original spot',
        reveal: {
          en: "ok i lied, his bed isn't that nice",
          es: 'mentira, no duerme en una cama tan linda',
        },
        revealNext: {
          en: "and his bed isn't that nice",
          es: 'ni duerme en una cama tan linda',
        },
      },
      {
        id: 'pose',
        changes: 'none',
        apply: 'an elegant posed look at the camera',
        revert: 'replace the elegant posed look with the original posture',
        reveal: {
          en: "ok i lied, he wasn't posing",
          es: 'mentira, no estaba posando',
        },
        revealNext: {
          en: "and he wasn't posing",
          es: 'ni estaba posando',
        },
      },
    ],
  },
];

const COLOR_WORD =
  /\b(pink|red|blue|green|black|white|gold|golden|silver|purple|orange|yellow|brown|gr[ae]y|teal|navy|rose|burgundy|pastel|neon|scarlet|crimson|violet|lilac|coral|beige|ivory|copper|maroon|cyan|magenta|turquoise|lavender|cream|tan|khaki|plum|ruby|emerald|sapphire|bronze|champagne|fuchsia|aqua|indigo|mint|peach|rosa|rojo|roja|azul|verde|negro|negra|blanco|blanca|dorado|dorada|plateado|plateada|morado|morada|naranja|amarillo|amarilla|marr[oó]n|gris|violeta|lila|fucsia|turquesa|celeste|crema)\b/i;

export interface SorryStyleChoice {
  id: string;
  lieIds: string[];
}

export function sorryStyleChoices(): SorryStyleChoice[] {
  return STYLES.map((style) => ({
    id: style.id,
    lieIds: style.lies.map((lie) => lie.id),
  }));
}

export function resolveSorryLocale(locale: string | undefined): 'en' | 'es' {
  return locale === 'es' ? 'es' : 'en';
}

export function closingCaption(locale: string | undefined): string {
  return CLOSING[resolveSorryLocale(locale)];
}

export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host.includes(':')) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0'
  ) {
    return false;
  }
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return false;
    }
  }
  return true;
}

function styleById(styleId: string): StyleDef {
  const style = STYLES.find((item) => item.id === styleId);
  if (!style) throw new SorryRequestError('Unknown style');
  return style;
}

function selectedLies(style: StyleDef, lieIds: string[]): LieDef[] {
  if (lieIds.length < 1 || lieIds.length > 4) {
    throw new SorryRequestError('Pick between 1 and 4 lies');
  }
  if (new Set(lieIds).size !== lieIds.length) {
    throw new SorryRequestError('Pick each lie once');
  }
  const lies = style.lies.filter((lie) => lieIds.includes(lie.id));
  if (lies.length !== lieIds.length) throw new SorryRequestError('Unknown lie');
  return lies;
}

export function costumeNoteOrEmpty(
  styleId: string,
  lieIds: string[],
  note: unknown
): string {
  if (note == null || note === '') return '';
  if (typeof note !== 'string') throw new SorryRequestError('Invalid costume');
  const trimmed = note.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (styleId !== 'halloween' || !lieIds.includes('costume')) {
    throw new SorryRequestError('Costume look is only for a Halloween costume');
  }
  if (
    trimmed.length > 80 ||
    !/^[\p{L}\p{N}][\p{L}\p{N} '",.&-]{0,79}$/u.test(trimmed)
  ) {
    throw new SorryRequestError('Costume look must be a short phrase');
  }
  if (/\b(ignore|prompt|system|http|https)\b/i.test(trimmed)) {
    throw new SorryRequestError('Costume look must describe the costume');
  }
  if (!COLOR_WORD.test(trimmed)) {
    throw new SorryRequestError('Name a color in the costume look');
  }
  return trimmed;
}

function copy(value: Copy, locale: 'en' | 'es'): string {
  return value[locale];
}

function costumeClause(note: string): string {
  return note
    ? `expensive store-bought costume fitting perfectly — ${note}`
    : 'expensive store-bought costume fitting perfectly';
}

function costumeRevert(note: string): string {
  return note
    ? `replace the expensive store-bought costume — ${note} — with a cheap costume`
    : 'replace the expensive store-bought costume with a cheap costume';
}

function applyClause(style: StyleDef, lie: LieDef, note: string): string {
  if (style.id === 'halloween' && lie.id === 'costume')
    return costumeClause(note);
  return lie.apply;
}

function revertClause(style: StyleDef, lie: LieDef, note: string): string {
  if (style.id === 'halloween' && lie.id === 'costume')
    return costumeRevert(note);
  return lie.revert;
}

/** Slide 1 applies every selected lie. Later prompts remove one lie each. */
export function sorryPrompts(
  styleId: string,
  lieIds: string[],
  costumeNote = ''
): string[] {
  const style = styleById(styleId);
  const lies = selectedLies(style, lieIds);
  const clauses = [...lies]
    .sort(
      (a, b) =>
        (a.applyOrder ?? style.lies.indexOf(a)) -
        (b.applyOrder ?? style.lies.indexOf(b))
    )
    .map((lie) => applyClause(style, lie, costumeNote));
  const upgrade = [
    SORRY_SYSTEM_PREFIX,
    '',
    `Upgrade this into a dream ${style.dream} photo: ${clauses.join(', ')}. Remove DIY artifacts (tape, cardboard edges, trash bags). Sharp modern photo, full subject in frame.`,
  ].join('\n');
  const removals = lies.slice(0, -1).map((lie) => {
    const lock =
      lie.changes === 'hair' || lie.changes === 'fur'
        ? ''
        : style.id === 'pet'
          ? ' Keep the fur unchanged.'
          : ' Keep the hair unchanged.';
    return [
      SORRY_SYSTEM_PREFIX,
      '',
      `Starting from this image, REMOVE ONLY this upgrade and revert it toward the real photo: ${revertClause(style, lie, costumeNote)}. Keep every other detail from the current image unchanged. Same face and pose.${lock}`,
    ].join('\n');
  });
  return [upgrade, ...removals];
}

export interface SorryPlan {
  styleId: string;
  lieIds: string[];
  costumeNote: string;
  locale: 'en' | 'es';
  /** Editable lines, one per model slide. The closer is separate. */
  captions: string[];
  closing: string;
  /** One apply-all prompt plus one removal per confessed lie. */
  prompts: string[];
}

export function planSorrySet(input: {
  styleId: unknown;
  lieIds: unknown;
  costumeNote?: unknown;
  captions?: unknown;
  locale?: unknown;
}): SorryPlan {
  if (typeof input.styleId !== 'string') {
    throw new SorryRequestError('Unknown style');
  }
  if (
    !Array.isArray(input.lieIds) ||
    input.lieIds.some((id) => typeof id !== 'string')
  ) {
    throw new SorryRequestError('Pick between 1 and 4 lies');
  }
  const style = styleById(input.styleId);
  const lieIds = input.lieIds as string[];
  const lies = selectedLies(style, lieIds);
  const costumeNote = costumeNoteOrEmpty(style.id, lieIds, input.costumeNote);
  const locale = resolveSorryLocale(
    typeof input.locale === 'string' ? input.locale : undefined
  );
  const defaults = [
    copy(style.opener, locale),
    ...lies
      .slice(0, -1)
      .map((lie, index) =>
        copy(index === 0 ? lie.reveal : lie.revealNext, locale)
      ),
  ];
  let captions = defaults;
  if (input.captions !== undefined) {
    if (
      !Array.isArray(input.captions) ||
      input.captions.length !== defaults.length ||
      input.captions.some((line) => typeof line !== 'string')
    ) {
      throw new SorryRequestError('Captions do not match the selected lies');
    }
    captions = (input.captions as string[]).map((line) => {
      const trimmed = line.trim().replace(/\s+/g, ' ');
      if (!trimmed || trimmed.length > 140 || /[\u0000-\u001F]/.test(trimmed)) {
        throw new SorryRequestError('Each caption must be a short line');
      }
      return trimmed;
    });
  }
  return {
    styleId: style.id,
    lieIds: lies.map((lie) => lie.id),
    costumeNote,
    locale,
    captions,
    closing: CLOSING[locale],
    prompts: sorryPrompts(
      style.id,
      lies.map((lie) => lie.id),
      costumeNote
    ),
  };
}
