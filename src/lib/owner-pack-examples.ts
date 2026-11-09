export type OwnerPackExample = {
  id: string;
  src: string;
  /** Chinese words already drawn on the GIF. */
  titleZh: string;
  /** Page label only. The GIF file itself stays Chinese. */
  titleEn: string;
  titleEs: string;
  titleAr: string;
};

/**
 * Finished sticker GIFs from the owner's earlier packs.
 * They are public examples, not outputs of this site's pipeline,
 * and they do not represent every style.
 */
export const OWNER_PACK_EXAMPLES: readonly OwnerPackExample[] = [
  {
    id: 'ex01',
    src: '/examples/owner-packs/ex01_corgi_jintian-ye-bang.gif',
    titleZh: '今天也棒',
    titleEn: 'Feeling great today',
    titleEs: 'Hoy también va bien',
    titleAr: 'اليوم رائع أيضًا',
  },
  {
    id: 'ex02',
    src: '/examples/owner-packs/ex02_dachshund-face_xiao-si-wo-le.gif',
    titleZh: '笑死我了',
    titleEn: 'Dying of laughter',
    titleEs: 'Me muero de risa',
    titleAr: 'أموت من الضحك',
  },
  {
    id: 'ex03',
    src: '/examples/owner-packs/ex03_shiba_wuyu-le.gif',
    titleZh: '无语了',
    titleEn: 'Speechless',
    titleEs: 'Sin palabras',
    titleAr: 'عجزت عن الكلام',
  },
  {
    id: 'ex04',
    src: '/examples/owner-packs/ex04_husky_xiao-bu-huo-le.gif',
    titleZh: '笑不活了',
    titleEn: "Can't stop laughing",
    titleEs: 'No puedo parar de reír',
    titleAr: 'لا أستطيع التوقف عن الضحك',
  },
  {
    id: 'ex05',
    src: '/examples/owner-packs/ex05_chihuahua_baobao-ma.gif',
    titleZh: '抱抱嘛',
    titleEn: 'Hug me',
    titleEs: 'Abrázame',
    titleAr: 'حضني',
  },
  {
    id: 'ex06',
    src: '/examples/owner-packs/ex06_dachshund-body_bu-xiang-dong.gif',
    titleZh: '不想动',
    titleEn: "Don't wanna move",
    titleEs: 'No quiero moverme',
    titleAr: 'ما أبغى أتحرك',
  },
];

export type OwnerPackExampleView = {
  id: string;
  src: string;
  label: string;
  alt: string;
};

export function ownerPackExamples(locale: string): OwnerPackExampleView[] {
  return OWNER_PACK_EXAMPLES.filter((row) => row.src.endsWith('.gif')).map(
    (row) => {
      if (locale === 'zh') {
        return {
          id: row.id,
          src: row.src,
          label: row.titleZh,
          alt: `以前做好的表情包：${row.titleZh}`,
        };
      }
      const label =
        locale === 'es'
          ? row.titleEs
          : locale === 'ar'
            ? row.titleAr
            : row.titleEn;
      const alt =
        locale === 'es'
          ? `Sticker de un paquete anterior. El texto del archivo está en chino. Traducción: ${label}`
          : locale === 'ar'
            ? `ملصق من حزمة سابقة. نص الملف صيني. الترجمة: ${label}`
            : `Earlier pack sticker. The file caption is Chinese. Translation: ${label}`;
      return { id: row.id, src: row.src, label, alt };
    }
  );
}
