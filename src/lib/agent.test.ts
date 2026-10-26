import { describe, expect, it } from 'vitest';

import { isLocalChatMediaUrl } from './agent';

describe('isLocalChatMediaUrl', () => {
  const origin = 'http://localhost:3000';

  it('recognizes bundled and same-origin media', () => {
    expect(isLocalChatMediaUrl('/videos/example.mp4', origin)).toBe(true);
    expect(
      isLocalChatMediaUrl('http://localhost:3000/images/frame.png', origin)
    ).toBe(true);
  });

  it('recognizes stale local-development ports', () => {
    expect(
      isLocalChatMediaUrl('http://localhost:3003/videos/example.mp4', origin)
    ).toBe(true);
    expect(
      isLocalChatMediaUrl('http://127.0.0.1:4173/images/frame.png', origin)
    ).toBe(true);
  });

  it('leaves external CDN media alone', () => {
    expect(
      isLocalChatMediaUrl('https://cdn.example.com/videos/example.mp4', origin)
    ).toBe(false);
  });
});
