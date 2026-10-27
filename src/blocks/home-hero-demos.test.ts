// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeHeroDemos, scrollHeroSlideWithinTrack } from './home-hero-demos';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/paraglide/messages.js', () => ({
  m: new Proxy(
    {},
    {
      get: () => () => 'Example',
    }
  ),
}));

class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('scrollHeroSlideWithinTrack', () => {
  it('scrolls the clip row and not the page', () => {
    const track = document.createElement('div');
    const slide = document.createElement('div');
    track.appendChild(slide);
    track.scrollLeft = 20;
    track.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 10,
        y: 0,
        toJSON() {},
      }) as DOMRect;
    slide.getBoundingClientRect = () =>
      ({
        left: 340,
        top: 80,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 340,
        y: 80,
        toJSON() {},
      }) as DOMRect;
    const scrollTo = vi.fn();
    const scrollIntoView = vi.fn();
    track.scrollTo = scrollTo;
    slide.scrollIntoView = scrollIntoView;

    scrollHeroSlideWithinTrack(track, slide);

    expect(scrollTo).toHaveBeenCalledWith({
      left: 350,
      behavior: 'smooth',
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('HomeHeroDemos dots', () => {
  it('changes slides inside the row without scrollIntoView', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.scrollTo = scrollTo;

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(HomeHeroDemos, {
          clips: [
            { id: 'a', src: '/a.mp4', title: 'One' },
            { id: 'b', src: '/b.mp4', title: 'Two' },
          ],
        })
      );
    });

    const dots = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(dots).toHaveLength(2);
    await act(async () => {
      dots[1]?.click();
    });

    expect(scrollTo).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
  });
});
