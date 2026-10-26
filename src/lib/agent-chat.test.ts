import { describe, expect, it } from 'vitest';

import { mediaTypeForAttachment, type PendingAttachment } from '@/lib/agent';
import { buildAgentMessage, splitAttachedImages } from '@/lib/agent-chat';

function attachment(
  id: string,
  kind: NonNullable<PendingAttachment['kind']>,
  url = `https://cdn.example.com/${id}`
): PendingAttachment {
  return {
    id,
    kind,
    name: id,
    preview: url,
    url,
    status: 'uploaded',
  };
}

describe('composer reference media', () => {
  it('keeps generic image material in order and hides its plumbing', () => {
    const message = buildAgentMessage('Animate this', [
      attachment('opening.png', 'image'),
      attachment('ending.png', 'image'),
    ]);

    expect(message).toContain('Attached media:');
    expect(message).toContain('- image 1:');
    expect(message).toContain('- image 2:');
    expect(message.indexOf('opening.png')).toBeLessThan(
      message.indexOf('ending.png')
    );
    expect(splitAttachedImages(message)).toEqual({
      text: 'Animate this',
      images: [
        'https://cdn.example.com/opening.png',
        'https://cdn.example.com/ending.png',
      ],
      audios: [],
      videos: [],
    });
  });

  it('preserves image, audio, and video without assigning generation roles', () => {
    const message = buildAgentMessage('Follow these references', [
      attachment('look.png', 'image'),
      attachment('beat.mp3', 'audio'),
      attachment('motion.mp4', 'video'),
    ]);

    expect(splitAttachedImages(message)).toEqual({
      text: 'Follow these references',
      images: ['https://cdn.example.com/look.png'],
      audios: ['https://cdn.example.com/beat.mp3'],
      videos: ['https://cdn.example.com/motion.mp4'],
    });
  });

  it('normalizes legacy parameter-specific drafts for the Agent', () => {
    expect(mediaTypeForAttachment({ kind: 'first_frame' })).toBe('image');
    expect(mediaTypeForAttachment({ kind: 'reference_image' })).toBe('image');
    expect(mediaTypeForAttachment({ kind: 'reference_audio' })).toBe('audio');
    expect(mediaTypeForAttachment({ kind: 'reference_video' })).toBe('video');
  });
});
