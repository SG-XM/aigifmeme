import { describe, expect, it } from 'vitest';

import {
  capReferenceImageUrls,
  CREW_SLOT_LIMIT,
  crewSlotRecord,
  DEFAULT_HOMEPAGE_CLIP_SECONDS,
  homepageClipSeconds,
  placeCrewPhotos,
} from './crew-slots';

describe('placeCrewPhotos', () => {
  it('puts the first photo on the center lead', () => {
    const placed = placeCrewPhotos({}, ['a']);
    expect(placed).toEqual({ slots: { center: 'a' }, dropped: 0 });
  });

  it('fills lead, near sides, then outer sides', () => {
    const placed = placeCrewPhotos({}, ['a', 'b', 'c', 'd', 'e']);
    expect(placed.dropped).toBe(0);
    expect(placed.slots).toEqual({
      center: 'a',
      left: 'b',
      right: 'c',
      farLeft: 'd',
      farRight: 'e',
    });
  });

  it('drops photos past the five slots', () => {
    const placed = placeCrewPhotos({}, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(placed.dropped).toBe(1);
    expect(Object.keys(placed.slots)).toHaveLength(CREW_SLOT_LIMIT);
    expect(placed.slots.farRight).toBe('e');
  });

  it('keeps a filled center and uses the next empty slots', () => {
    const placed = placeCrewPhotos({ center: 'lead' }, ['b', 'c']);
    expect(placed.slots).toEqual({ center: 'lead', left: 'b', right: 'c' });
  });

  it('replaces the tapped slot and parks the rest on empty leads first', () => {
    const placed = placeCrewPhotos({ left: 'keep' }, ['new', 'extra'], 'right');
    expect(placed.slots.right).toBe('new');
    expect(placed.slots.center).toBe('extra');
    expect(placed.slots.left).toBe('keep');
    expect(placed.dropped).toBe(0);
  });

  it('replaces the center lead when that slot is the target', () => {
    const placed = placeCrewPhotos(
      { center: 'old' },
      ['new', 'side'],
      'center'
    );
    expect(placed.slots.center).toBe('new');
    expect(placed.slots.left).toBe('side');
  });
});

describe('crew lineup helpers', () => {
  it('keeps only the center photo in single mode', () => {
    expect(
      crewSlotRecord(
        { farLeft: 'a', left: 'b', center: 'c', right: 'd' },
        'single'
      )
    ).toEqual({ center: 'c' });
  });

  it('snaps clip length to 12 or 15 seconds, defaulting to 12', () => {
    expect(DEFAULT_HOMEPAGE_CLIP_SECONDS).toBe(12);
    expect(homepageClipSeconds(12)).toBe(12);
    expect(homepageClipSeconds(15)).toBe(15);
    expect(homepageClipSeconds(9)).toBe(12);
  });

  it('forwards at most five reference photos', () => {
    expect(capReferenceImageUrls(['1', '2', '3', '4', '5', '6'])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });
});
