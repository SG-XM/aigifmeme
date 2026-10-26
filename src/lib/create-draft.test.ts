import { describe, expect, it } from 'vitest';

import { isFreshTimestamp } from './auth-return';
import type { CreateDraft } from './create-draft';

describe('create draft shape', () => {
  it('keeps slot photos only while the draft is fresh', () => {
    const draft: CreateDraft = {
      campaign: 'bulin',
      effect: 'trio',
      settings: {
        modelOption: 'seedance-2-mini',
        resolution: '720p',
        duration: 12,
        aspectRatio: '9:16',
      },
      photos: [
        {
          slot: 'center',
          name: 'portrait.png',
          type: 'image/png',
          blob: new Blob(['x'], { type: 'image/png' }),
        },
      ],
      savedAt: Date.now(),
    };
    expect(draft.photos.map((photo) => photo.slot)).toEqual(['center']);
    expect(isFreshTimestamp(draft.savedAt)).toBe(true);
    expect(isFreshTimestamp(draft.savedAt - 31 * 60 * 1000)).toBe(false);
  });
});
