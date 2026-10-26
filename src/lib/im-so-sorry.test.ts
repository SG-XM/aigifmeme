import { describe, expect, it } from 'vitest';

import {
  closingCaption,
  isPublicHttpsUrl,
  planSorrySet,
  SORRY_CREDIT_COST,
  SORRY_MODEL,
  SORRY_SYSTEM_PREFIX,
  SorryRequestError,
} from './im-so-sorry';

const halloween = ['wig', 'costume', 'party', 'makeup'];

describe("I'm so sorry prompts and captions", () => {
  it('keeps the credit cost and the nano-banana edit model fixed', () => {
    expect(SORRY_CREDIT_COST).toBe(5);
    expect(SORRY_MODEL).toBe('google/nano-banana-edit');
  });

  it('burns the published Halloween chain and leaves makeup silent', () => {
    const plan = planSorrySet({ styleId: 'halloween', lieIds: halloween });
    expect(plan.captions).toEqual([
      'this was my halloween costume',
      "ok i lied, my wig wasn't that good",
      "my costume wasn't that expensive either",
      "and it wasn't a fancy party",
    ]);
    expect(plan.closing).toBe("i'm so sorry");
    expect(plan.prompts).toHaveLength(4);
    expect(plan.prompts[0]).toContain(SORRY_SYSTEM_PREFIX);
    expect(plan.prompts[0]).toContain(
      'Upgrade this into a dream Halloween costume photo: perfect wig/hair, expensive store-bought costume fitting perfectly, pro makeup, decorated fancy Halloween party porch, warm evening light. Remove DIY artifacts (tape, cardboard edges, trash bags). Sharp modern photo, full subject in frame.'
    );
    expect(plan.prompts[1]).toContain(
      'REMOVE ONLY this upgrade and revert it toward the real photo: replace the perfect wig with a cheap yellow store wig.'
    );
    expect(plan.prompts[1]).not.toContain('Keep the hair unchanged.');
    expect(plan.prompts[2]).toContain(
      'replace the expensive store-bought costume with a cheap costume'
    );
    expect(plan.prompts[2]).toContain('Keep the hair unchanged.');
    expect(plan.prompts[3]).toContain(
      'replace the decorated fancy Halloween party porch with an ordinary undecorated entrance'
    );
    expect(plan.prompts.join('\n')).not.toContain('replace the pro makeup');
    expect(plan.prompts.join('\n')).not.toContain("i'm so sorry");
  });

  it('requires a color when the costume is named', () => {
    expect(() =>
      planSorrySet({
        styleId: 'halloween',
        lieIds: halloween,
        costumeNote: 'butterfly',
      })
    ).toThrow(SorryRequestError);
    const plan = planSorrySet({
      styleId: 'halloween',
      lieIds: halloween,
      costumeNote: 'pink butterfly with tulle skirt',
    });
    expect(plan.prompts[0]).toContain(
      'expensive store-bought costume fitting perfectly — pink butterfly with tulle skirt'
    );
    expect(plan.prompts[2]).toContain(
      'replace the expensive store-bought costume — pink butterfly with tulle skirt — with a cheap costume'
    );
  });

  it('uses the published childhood, baby, pet, and sports caption sets', () => {
    expect(
      planSorrySet({
        styleId: 'childhood',
        lieIds: ['house', 'blonde', 'candid', 'dress'],
      }).captions
    ).toEqual([
      'my mom dressed me up as a princess when i was little',
      "ok i lied, that wasn't our house",
      "i wasn't blonde either",
      "and i wasn't that cute",
    ]);
    expect(
      planSorrySet({
        styleId: 'baby',
        lieIds: ['hair', 'outfit', 'studio', 'smile'],
        locale: 'es',
      }).captions
    ).toEqual([
      'esta soy yo de bebé',
      'mentira, no tenía pelo',
      'tampoco era mi ropa',
      'ni era una sesión de fotos',
    ]);
    expect(closingCaption('es')).toBe('perdón');
    expect(
      planSorrySet({
        styleId: 'pet',
        lieIds: ['fluffy', 'bow', 'bed', 'pose'],
      }).captions
    ).toEqual([
      'this is my dog posing',
      "ok i lied, he's not that fluffy",
      "he doesn't wear bows either",
      "and his bed isn't that nice",
    ]);
    const sports = planSorrySet({
      styleId: 'sports',
      lieIds: ['jump', 'muscles', 'blonde', 'kit'],
    });
    expect(sports.captions).toEqual([
      'this is me on a normal day competing',
      "ok i lied, i can't jump that high",
      "i'm not that strong either",
      "i'm not blonde either",
    ]);
    expect(sports.prompts[0]).toContain('a higher jump, pro muscles');
    expect(sports.prompts[0]).not.toMatch(/stadium/i);
    expect(
      planSorrySet({
        styleId: 'sports',
        lieIds: ['jump', 'muscles', 'blonde'],
      }).captions
    ).toEqual([
      'this is me on a normal day competing',
      "ok i lied, i can't jump that high",
      "i'm not that strong either",
    ]);
  });

  it('keeps a subset in catalog order and still charges the same set', () => {
    const plan = planSorrySet({
      styleId: 'halloween',
      lieIds: ['party', 'wig'],
    });
    expect(plan.lieIds).toEqual(['wig', 'party']);
    expect(plan.captions).toEqual([
      'this was my halloween costume',
      "ok i lied, my wig wasn't that good",
    ]);
    expect(plan.prompts).toHaveLength(2);
    expect(SORRY_CREDIT_COST).toBe(5);
  });

  it('rejects private and non-https image urls', () => {
    expect(isPublicHttpsUrl('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isPublicHttpsUrl('http://cdn.example.com/a.jpg')).toBe(false);
    expect(isPublicHttpsUrl('https://127.0.0.1/a.jpg')).toBe(false);
    expect(isPublicHttpsUrl('https://169.254.169.254/latest')).toBe(false);
    expect(isPublicHttpsUrl('https://10.0.0.5/a.jpg')).toBe(false);
    expect(isPublicHttpsUrl('https://localhost/a.jpg')).toBe(false);
  });
});
