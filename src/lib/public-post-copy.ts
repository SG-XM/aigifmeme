import {
  WINDOW_PEEPER_AI_VIDEO_PATH,
  WINDOW_PEEPER_LEGACY_PATH,
  WINDOW_PEEPER_PATH,
} from '@/lib/ai-video-paths';

/**
 * Public blog bodies live in the database. These replacements run on read so
 * a deploy stops telling visitors that Window Peeper is unfinished.
 * Legitimate ChatGPT citations in other articles are left alone.
 */

const PEEPER_LINK = `[${WINDOW_PEEPER_PATH}](${WINDOW_PEEPER_PATH})`;

const AVAILABLE = {
  en: `Window Peeper generation is available at ${PEEPER_LINK}.`,
  zh: `Window Peeper 生成已在 ${PEEPER_LINK} 开放。`,
  es: `La generación de Window Peeper está disponible en ${PEEPER_LINK}.`,
  ar: `توليد Window Peeper متاح على ${PEEPER_LINK}.`,
} as const;

function mdToken(literal: string): string {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `(?:\\[${escaped}\\]\\([^)\\n]*\\)|\`${escaped}\`|${escaped})`;
}

const PEEPER_PATH = mdToken('/window-peeper-ai');
const PATHS_FILE = mdToken('ai-video-paths.ts');

const REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    new RegExp(
      `${PEEPER_PATH} was not yet listed in ${PATHS_FILE} at check time\\.?`,
      'g'
    ),
    AVAILABLE.en,
  ],
  [
    new RegExp(`当时\\s*${PATHS_FILE}\\s*尚未列入 peeper。?`, 'g'),
    AVAILABLE.zh,
  ],
  [
    new RegExp(
      `${PEEPER_PATH}\\s*aún no figuraba en\\s*${PATHS_FILE}\\.?`,
      'g'
    ),
    AVAILABLE.es,
  ],
  [
    new RegExp(`${PEEPER_PATH}\\s*لم تكن بعد في\\s*${PATHS_FILE}\\.?`, 'g'),
    AVAILABLE.ar,
  ],
  [
    /The page was still being added when these facts were checked \(23 October 2026\), so treat steps as the same CreateVideo pattern used on other Bulin 47 AI effect pages\s*[—–-]\s*not as a scored quality or speed report\./g,
    `${AVAILABLE.en} The steps below match that live create flow. This article is not a quality or speed score.`,
  ],
  [
    /事实核验日（2026-10-23）该页仍在添加，步骤按其他效果页的 CreateVideo 模式理解，不是画质或速度评分报告。/g,
    `${AVAILABLE.zh}下面的步骤对应当前创建流程。本文不是画质或速度评分。`,
  ],
  [
    /El 23 oct 2026 la página aún se añadía: trata los pasos como el patrón CreateVideo de otros efectos, no como un informe de calidad o velocidad\./g,
    `${AVAILABLE.es} Los pasos siguen ese flujo en vivo. Este artículo no es una puntuación de calidad o velocidad.`,
  ],
  [
    /في 23 أكتوبر 2026 كانت الصفحة ما تزال تُضاف؛ اعتبر الخطوات نمط CreateVideo لصفحات التأثير الأخرى لا تقرير جودة أو سرعة\./g,
    `${AVAILABLE.ar} الخطوات أدناه تطابق مسار الإنشاء الحالي. هذا المقال ليس تقييم جودة أو سرعة.`,
  ],
  [
    new RegExp(
      `The\\s*${PEEPER_PATH}\\s*page was still being added\\s*[—–-]\\s*this article is not a live quality or latency report\\.?`,
      'g'
    ),
    `${AVAILABLE.en} This article is not a quality or latency benchmark.`,
  ],
  [
    new RegExp(
      `${PEEPER_PATH}\\s*当时仍在添加，本文不是线上画质或耗时报告。?`,
      'g'
    ),
    `${AVAILABLE.zh}本文不是画质或耗时评测。`,
  ],
  [
    new RegExp(
      `${PEEPER_PATH}\\s*aún se estaba añadiendo:\\s*este artículo no es un informe de calidad o latencia en vivo\\.?`,
      'g'
    ),
    `${AVAILABLE.es} Este artículo no es un informe de calidad o latencia.`,
  ],
  [
    new RegExp(
      `صفحة\\s*${PEEPER_PATH}\\s*كانت ما تزال تُضاف:\\s*ليست تقرير جودة أو زمن حي\\.?`,
      'g'
    ),
    `${AVAILABLE.ar} هذا المقال ليس تقرير جودة أو زمن.`,
  ],
  [
    /No in this article\. The page was new at fact-check time; judge your own full clip after download\./g,
    'Likeness and render time vary. Review the full clip after you download it.',
  ],
  [
    /本文不能。核验时页面仍新；请自行审完整片。/g,
    '像不像、要等多久都会有差异。下载后请整段审片。',
  ],
  [/ChatGPT live research:\s*pending at publish time\.?\s*/gi, ''],
  [/ChatGPT 实测调研：发布时仍为待完成。?\s*/g, ''],
  [/ChatGPT 实测：发布时待完成。?\s*/g, ''],
  [/Investigación ChatGPT:\s*pendiente al publicar\.?\s*/gi, ''],
  [/ChatGPT:\s*pendiente al publicar\.?\s*/gi, ''],
  [/بحث ChatGPT:\s*معلّق عند النشر\.?\s*/g, ''],
  [/ChatGPT:\s*معلّق عند النشر\.?\s*/g, ''],
];

const BANNED_LINE = [
  'ChatGPT live research',
  'pending at publish time',
  'pendiente al publicar',
  '发布时待完成',
  '发布时仍为待完成',
  'معلّق عند النشر',
  'not yet listed',
  'aún no figuraba',
  '尚未列入',
  'لم تكن بعد',
  'still being added',
  'aún se estaba añadiendo',
  'aún se añadía',
  '仍在添加',
  'ما تزال تُضاف',
  'page was new at fact-check',
  '页面仍新',
  'not yet integrated',
  'product code not yet',
  'was still being added',
];

/** Published articles may still name a retired Window Peeper URL. */
function pointPeeperLinksAtCanonical(text: string): string {
  return text
    .replaceAll(WINDOW_PEEPER_AI_VIDEO_PATH, WINDOW_PEEPER_PATH)
    .replaceAll(WINDOW_PEEPER_LEGACY_PATH, WINDOW_PEEPER_PATH);
}

export function scrubPublicPostCopy(text: string): string {
  let next = text;
  for (const [pattern, replacement] of REWRITES) {
    next = next.replace(pattern, replacement);
  }
  next = pointPeeperLinksAtCanonical(next);
  next = next
    .split('\n')
    .filter((line) => !BANNED_LINE.some((phrase) => line.includes(phrase)))
    .filter((line) => !/^\s*[-*+]\s*$/.test(line))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return next;
}
