import type { BlogLocale, BlogPost, BlogPostDetail } from './index';

/**
 * Code-published guides for the i'm so sorry photo trend.
 * They are tagged `im-so-sorry` so the effect page can list them without a
 * database row. A published database post with the same slug replaces one.
 * Titles stay the English H1 in every locale.
 */
export const IM_SO_SORRY_GEO_TAG = 'im-so-sorry';

const LINK = "[i'm so sorry photo trend](/im-so-sorry)";

type Localized = { description: string; content: string };

type GeoArticle = {
  id: string;
  slug: string;
  createdAt: string;
  title: string;
  copy: Record<BlogLocale, Localized>;
};

const ARTICLES: readonly GeoArticle[] = [
  {
    id: 'geo-im-so-sorry-photo-trend',
    slug: 'im-so-sorry-photo-trend',
    createdAt: '2026-10-23T03:00:00.000Z',
    title: "I'm So Sorry Photo Trend: How the Lie Carousel Works",
    copy: {
      en: {
        description:
          "The i'm so sorry photo trend is a static photo carousel that takes one lie back on each slide. It's a photo carousel, not a video, and it is not a lyrics page.",
        content: `The **i'm so sorry photo trend** is a still photo carousel. You start with one photo. The first slide is a dressed-up version. Each later slide takes one claim back. The last slide is the original photo.

This is not a song lyric and not a video. **It's a photo carousel, not a video.**

## Carousel or video?

It's a photo carousel, not a video. Each file is a 1080×1440 still. No soundtrack is added. The page does not post the slides for you.

## How the lie reveal works

A set uses one style and one to four lies. Lies you do not pick are left out. The ones you do pick stay in their catalog order.

- The first slide is the dream version, with the opening line burned onto the picture.
- Each following edited slide removes one lie and burns that confession.
- The last lie you picked does not get its own confession line. The original photo is what gives it away.
- The last slide is that original photo. The closer is burned on the server and cannot be edited. In English, Chinese, and Arabic that line is \`i'm so sorry\`. On the Spanish site it is \`perdón\`.

You can edit the other lines before you generate.

## Make a set

Build one on the ${LINK} page. A set costs 5 credits, however many lies you pick. If the whole set fails, those 5 credits are returned.

This is an independent fan tool and is not affiliated with TikTok.`,
      },
      zh: {
        description:
          "i'm so sorry photo trend 是静态照片轮播：每一张收回一个谎。这是照片轮播，不是视频，也不是歌词页。",
        content: `**i'm so sorry photo trend** 是一组静止照片轮播。从一张照片开始。第一张是美化后的样子，后面每一张收回一个说法，最后一张是原图。

这不是歌词，也不是视频。**这是照片轮播，不是视频。**

## 是轮播还是视频？

这是照片轮播，不是视频。每张图是 1080×1440 的静帧。页面不会加上声音，也不会替你把图片发出去。

## 谎是怎么一层层收回的

一组选一个风格，再选一到四个谎。没选的谎不会出现，选中的谎保持目录里的顺序。

- 第一张是美化版，开场那句烧在画面上。
- 后面每一张改过的图去掉一个谎，并烧上对应的那句坦白。
- 你选的最后一个谎没有单独的坦白句，原图本身就是揭穿。
- 最后一张就是这张原图。收尾那句在服务器上烧录，不能改。英语、中文和阿拉伯语页面上这句是 \`i'm so sorry\`。西班牙语页面上是 \`perdón\`。

生成前，除了最后一句，其他字幕可以改。

## 做一组

在 ${LINK} 页面制作。无论选几个谎，一组都是 5 积分。整组失败时，这 5 积分会退回。

这是独立粉丝工具，与 TikTok 没有关联。`,
      },
      es: {
        description:
          "El i'm so sorry photo trend es un carrusel de fotos fijas: cada diapositiva retira una mentira. Es un carrusel de fotos, no un video, y no es una página de letras.",
        content: `El **i'm so sorry photo trend** es un carrusel de fotos quietas. Empiezas con una foto. La primera diapositiva es la versión arreglada. Cada una siguiente retira una afirmación. La última es la foto original.

No es una letra de canción ni un video. **Es un carrusel de fotos, no un video.**

## ¿Carrusel o video?

Es un carrusel de fotos, no un video. Cada archivo es una imagen fija de 1080×1440. No se añade sonido. La página no publica las diapositivas por ti.

## Cómo se revela la mentira

Un set usa un estilo y de una a cuatro mentiras. Las que no eliges no entran. Las que eliges conservan el orden del catálogo.

- La primera diapositiva es la versión soñada, con la frase de apertura quemada en la imagen.
- Cada diapositiva editada siguiente quita una mentira y quema esa confesión.
- La última mentira elegida no tiene una frase propia. La foto original es la que la delata.
- La última diapositiva es esa foto original. El cierre se quema en el servidor y no se puede editar. En inglés, chino y árabe la frase es \`i'm so sorry\`. En el sitio en español es \`perdón\`.

Puedes editar las otras frases antes de generar.

## Haz un set

Hazlo en la página ${LINK}. Un set cuesta 5 créditos, elijas las mentiras que elijas. Si falla el set entero, esos 5 créditos vuelven.

Es una herramienta de fans independiente y no está afiliada a TikTok.`,
      },
      ar: {
        description:
          "ترند i'm so sorry photo trend هو عرض صور ثابت: كل شريحة تسحب كذبة واحدة. إنه عرض صور وليس فيديو، وليس صفحة كلمات أغنية.",
        content: `**i'm so sorry photo trend** هو عرض صور ثابتة. تبدأ بصورة واحدة. الشريحة الأولى هي النسخة المزيّنة. كل شريحة بعدها تسحب ادّعاءً واحدًا. الشريحة الأخيرة هي الصورة الأصلية.

هذا ليس كلمات أغنية وليس فيديو. **إنه عرض صور، وليس فيديو.**

## عرض صور أم فيديو؟

إنه عرض صور، وليس فيديو. كل ملف صورة ثابتة بقياس 1080×1440. لا تُضاف موسيقى. الصفحة لا تنشر الشرائح عنك.

## كيف تنكشف الكذبة

المجموعة تستخدم أسلوبًا واحدًا ومن كذبة إلى أربع. الكذبة التي لا تختارها لا تظهر. التي تختارها تبقى بترتيب القائمة.

- الشريحة الأولى هي النسخة الحلم، وجملة البداية محروقة على الصورة.
- كل شريحة معدّلة بعدها تزيل كذبة واحدة وتحرق جملة الاعتراف.
- آخر كذبة اخترتها ليس لها جملة مستقلة. الصورة الأصلية هي التي تكشفها.
- الشريحة الأخيرة هي تلك الصورة الأصلية. جملة الختام تُحرق على الخادم ولا يمكن تعديلها. في صفحات الإنجليزية والصينية والعربية الجملة هي \`i'm so sorry\`. في الصفحة الإسبانية هي \`perdón\`.

يمكنك تعديل الجمل الأخرى قبل التوليد.

## اصنع مجموعة

اصنعها في صفحة ${LINK}. المجموعة تكلف 5 أرصدة مهما كان عدد الأكاذيب. إذا فشلت المجموعة كلها، تعود هذه الأرصدة الخمسة.

هذه أداة مستقلة للمعجبين وليست تابعة لـ TikTok.`,
      },
    },
  },
  {
    id: 'geo-im-so-sorry-filter-tiktok',
    slug: 'im-so-sorry-filter-tiktok',
    createdAt: '2026-10-23T02:00:00.000Z',
    title: "I'm So Sorry Filter TikTok: Make the Slides From One Photo",
    copy: {
      en: {
        description:
          "Make the i'm so sorry filter tiktok slides from one photo: upload, pick the lies, and keep i'm so sorry on the last slide.",
        content: `People look up **i'm so sorry filter tiktok** for this caption style. Here it is a photo carousel made from one picture, part of the i'm so sorry photo trend. The slides are stills. It's a photo carousel, not a video.

## How to make the slides

1. Open the ${LINK} page.
2. Upload one photo. The styles on the page cover a portrait, a childhood shot, a baby photo, a pet, or a sports picture.
3. Pick a style and at least one lie, up to four. If you choose a costume look, name a color in that note.
4. Read the captions. Every line except the last one can be edited. The last line stays fixed.
5. Generate the set. The first slide is the dream version. Each next slide takes one lie back. The last slide is your original photo with the closer burned on: \`i'm so sorry\` (or \`perdón\` on the Spanish site).

Download the slides and post them yourself if you want. This page does not post to TikTok and does not embed a sound. It is not affiliated with TikTok.

A set costs 5 credits. If the whole set fails, those 5 credits come back.`,
      },
      zh: {
        description:
          "用一张照片做 i'm so sorry filter tiktok 幻灯片：上传、选谎，最后一张保留 i'm so sorry。",
        content: `人们会用 **i'm so sorry filter tiktok** 搜索这种字幕样式。在这里，它是用一张照片做成的轮播，属于 i'm so sorry photo trend。这些是静帧。这是照片轮播，不是视频。

## 怎么做出这些图片

1. 打开 ${LINK} 页面。
2. 上传一张照片。页面上的风格包括人像、童年照、宝宝照、宠物或运动照。
3. 选一个风格，再至少选一个谎，最多四个。如果选了服装造型，要在备注里写一个颜色。
4. 看一遍字幕。除了最后一句，都可以改。最后一句是固定的。
5. 生成这一组。第一张是美化版，之后每一张收回一个谎。最后一张是你的原图，收尾句烧在画面上：\`i'm so sorry\`（西班牙语页面是 \`perdón\`）。

你可以下载后自己发布。这个页面不会替你发到 TikTok，也不会嵌进声音。它与 TikTok 没有关联。

一组 5 积分。整组失败时，这 5 积分会退回。`,
      },
      es: {
        description:
          "Haz las diapositivas del i'm so sorry filter tiktok con una foto: sube, elige las mentiras y deja i'm so sorry en la última.",
        content: `La gente busca **i'm so sorry filter tiktok** por este estilo de texto. Aquí es un carrusel de fotos hecho con una imagen, dentro del i'm so sorry photo trend. Las diapositivas son fotos fijas. Es un carrusel de fotos, no un video.

## Cómo hacer las diapositivas

1. Abre la página ${LINK}.
2. Sube una foto. Los estilos de la página cubren un retrato, una foto de infancia, de bebé, de mascota o de deporte.
3. Elige un estilo y al menos una mentira, hasta cuatro. Si eliges un disfraz, escribe un color en esa nota.
4. Revisa los textos. Todas las frases se pueden editar menos la última. La última queda fija.
5. Genera el set. La primera diapositiva es la versión soñada. Cada una siguiente retira una mentira. La última es tu foto original con el cierre quemado: \`i'm so sorry\` (o \`perdón\` en el sitio en español).

Descarga las diapositivas y publícalas tú si quieres. Esta página no publica en TikTok y no incrusta sonido. No está afiliada a TikTok.

Un set cuesta 5 créditos. Si falla el set entero, esos 5 créditos vuelven.`,
      },
      ar: {
        description:
          "اصنع شرائح i'm so sorry filter tiktok من صورة واحدة: ارفع الصورة، اختر الأكاذيب، واترك i'm so sorry على الشريحة الأخيرة.",
        content: `يبحث الناس عن **i'm so sorry filter tiktok** لأسلوب التعليق هذا. هنا هو عرض صور يُصنع من صورة واحدة ضمن i'm so sorry photo trend. الشرائح صور ثابتة. إنه عرض صور، وليس فيديو.

## كيف تصنع الشرائح

1. افتح صفحة ${LINK}.
2. ارفع صورة واحدة. الأساليب في الصفحة تغطي صورة شخصية أو طفولة أو رضيع أو حيوان أليف أو رياضة.
3. اختر أسلوبًا وكذبة واحدة على الأقل، وحتى أربع. إذا اخترت مظهر زي، اكتب لونًا في تلك الملاحظة.
4. راجع التعليقات. يمكن تعديل كل جملة ما عدا الأخيرة. الجملة الأخيرة ثابتة.
5. ولّد المجموعة. الشريحة الأولى هي النسخة الحلم. كل شريحة بعدها تسحب كذبة واحدة. الشريحة الأخيرة هي صورتك الأصلية والجملة الختامية محروقة عليها: \`i'm so sorry\` (أو \`perdón\` في الصفحة الإسبانية).

نزّل الشرائح وانشرها بنفسك إذا أردت. هذه الصفحة لا تنشر على TikTok ولا تضمّن صوتًا. ليست تابعة لـ TikTok.

المجموعة تكلف 5 أرصدة. إذا فشلت المجموعة كلها، تعود هذه الأرصدة الخمسة.`,
      },
    },
  },
  {
    id: 'geo-im-so-sorry-photo-trend-download',
    slug: 'im-so-sorry-photo-trend-download',
    createdAt: '2026-10-23T01:00:00.000Z',
    title: "I'm So Sorry Photo Trend Download: Get Your Own 5-Slide Set",
    copy: {
      en: {
        description:
          "An i'm so sorry photo trend download is a set of still slides you save yourself. A full set is 5 slides and costs 5 credits. We do not post it to TikTok for you.",
        content: `An **i'm so sorry photo trend download** is the slide set you save from the carousel. You get image files. It's a photo carousel, not a video, and nothing is posted to TikTok for you.

## Can I download it?

Yes. When the set is ready, preview every slide and download them. You can save them one by one or together. The files are 1080×1440 stills with the caption burned on. No sound is included.

## What a 5-slide set is

Pick four lies and the set has five slides:

1. The dream version.
2. The first confession.
3. The next confession.
4. The next confession.
5. Your original photo, with \`i'm so sorry\` burned on (\`perdón\` on the Spanish site).

The last lie you picked is the one the original photo gives away. It does not get a separate confession line. If you pick fewer than four lies, you get fewer slides. The price does not change: every set costs 5 credits. If the whole set fails, those 5 credits are returned.

Start on the ${LINK} page. This tool does not upload or publish the slides for you. It is not affiliated with TikTok.`,
      },
      zh: {
        description:
          "i'm so sorry photo trend download 是你自己保存的静帧图片。完整一组是 5 张，花费 5 积分。我们不会替你发到 TikTok。",
        content: `**i'm so sorry photo trend download** 就是你从轮播里保存下来的那一组图。你拿到的是图片文件。这是照片轮播，不是视频，也不会有人替你发到 TikTok。

## 可以下载吗？

可以。一组做好之后，先预览每一张，再下载。可以一张张保存，也可以一起保存。文件是 1080×1440 的静帧，字幕已经烧在画面上。里面没有声音。

## 5 张一组是什么

选四个谎，就会得到五张：

1. 美化版。
2. 第一句坦白。
3. 下一句坦白。
4. 再下一句坦白。
5. 你的原图，烧着 \`i'm so sorry\`（西班牙语页面是 \`perdón\`）。

你选的最后一个谎由原图揭穿，没有单独的坦白句。如果少于四个谎，张数会少一些。价格不变：每一组都是 5 积分。整组失败时，这 5 积分会退回。

从 ${LINK} 页面开始。这个工具不会替你上传或发布这些图片。它与 TikTok 没有关联。`,
      },
      es: {
        description:
          "Una descarga del i'm so sorry photo trend download son diapositivas fijas que guardas tú. Un set completo tiene 5 diapositivas y cuesta 5 créditos. No lo publicamos en TikTok por ti.",
        content: `Una **i'm so sorry photo trend download** es el set de diapositivas que guardas del carrusel. Recibes archivos de imagen. Es un carrusel de fotos, no un video, y nadie lo publica en TikTok por ti.

## ¿Puedo descargarlo?

Sí. Cuando el set está listo, previsualiza cada diapositiva y descárgalas. Puedes guardarlas de una en una o juntas. Los archivos son imágenes fijas de 1080×1440 con el texto quemado. No incluyen sonido.

## Qué es un set de 5 diapositivas

Elige cuatro mentiras y el set tiene cinco diapositivas:

1. La versión soñada.
2. La primera confesión.
3. La siguiente confesión.
4. La siguiente confesión.
5. Tu foto original, con \`i'm so sorry\` quemado (\`perdón\` en el sitio en español).

La última mentira que elegiste es la que delata la foto original. No tiene una frase aparte. Si eliges menos de cuatro mentiras, hay menos diapositivas. El precio no cambia: cada set cuesta 5 créditos. Si falla el set entero, esos 5 créditos vuelven.

Empieza en la página ${LINK}. Esta herramienta no sube ni publica las diapositivas por ti. No está afiliada a TikTok.`,
      },
      ar: {
        description:
          "تنزيل i'm so sorry photo trend download هو مجموعة شرائح ثابتة تحفظها بنفسك. المجموعة الكاملة 5 شرائح وتكلف 5 أرصدة. لا ننشرها على TikTok عنك.",
        content: `**i'm so sorry photo trend download** هو مجموعة الشرائح التي تحفظها من العرض. تحصل على ملفات صور. إنه عرض صور وليس فيديو، ولا يُنشر شيء على TikTok عنك.

## هل يمكنني تنزيله؟

نعم. عندما تجهز المجموعة، عاين كل شريحة ثم نزّلها. يمكنك حفظها واحدة واحدة أو معًا. الملفات صور ثابتة 1080×1440 والتعليق محروق عليها. لا صوت بداخلها.

## ما هي مجموعة الشرائح الخمس

اختر أربع أكاذيب فتصير المجموعة خمس شرائح:

1. النسخة الحلم.
2. الاعتراف الأول.
3. الاعتراف التالي.
4. الاعتراف الذي بعده.
5. صورتك الأصلية وعليها \`i'm so sorry\` محروقة (\`perdón\` في الصفحة الإسبانية).

آخر كذبة اخترتها هي التي تكشفها الصورة الأصلية. ليس لها جملة منفصلة. إذا اخترت أقل من أربع أكاذيب، يكون عدد الشرائح أقل. السعر لا يتغير: كل مجموعة تكلف 5 أرصدة. إذا فشلت المجموعة كلها، تعود هذه الأرصدة الخمسة.

ابدأ من صفحة ${LINK}. هذه الأداة لا ترفع الشرائح ولا تنشرها عنك. ليست تابعة لـ TikTok.`,
      },
    },
  },
];

const LOCALES: readonly BlogLocale[] = ['en', 'zh', 'es', 'ar'];

function asLocale(locale: string): BlogLocale {
  if (locale === 'zh' || locale === 'es' || locale === 'ar') return locale;
  return 'en';
}

export function imSoSorryGeoPosts(
  locale: string,
  options?: { includeContent?: boolean }
): BlogPost[] {
  const language = asLocale(locale);
  const includeContent = options?.includeContent === true;
  return ARTICLES.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    description: article.copy[language].description,
    createdAt: article.createdAt,
    tags: [IM_SO_SORRY_GEO_TAG],
    ...(includeContent ? { content: article.copy[language].content } : {}),
  }));
}

export function imSoSorryGeoPost(
  slug: string,
  locale: string
): BlogPostDetail | null {
  const article = ARTICLES.find((item) => item.slug === slug.toLowerCase());
  if (!article) return null;
  const language = asLocale(locale);
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    description: article.copy[language].description,
    createdAt: article.createdAt,
    tags: [IM_SO_SORRY_GEO_TAG],
    content: article.copy[language].content,
    localizedLocales: [...LOCALES],
    contentLocale: language,
  };
}

export function imSoSorryGeoSitemapEntries(): Array<{
  slug: string;
  createdAt: string;
  locales: BlogLocale[];
}> {
  return ARTICLES.map((article) => ({
    slug: article.slug,
    createdAt: article.createdAt,
    locales: [...LOCALES],
  }));
}

export const IM_SO_SORRY_GEO_TITLES = ARTICLES.map((article) => article.title);
