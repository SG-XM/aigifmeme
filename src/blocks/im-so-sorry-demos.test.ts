// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SORRY_DEMO_STATIC_PATHS } from '@/lib/im-so-sorry-demos';

import { isReadyDemoImage, SorryDemoCarousel } from './im-so-sorry-demos';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/paraglide/messages.js', () => ({
  m: {
    'sorry.demo_placeholder': () => 'Upload a 1080×1440 photo',
  },
}));

const CAPTIONS = [
  'this was my halloween costume',
  "ok i lied, my wig wasn't that good",
  "my costume wasn't that expensive either",
  "and it wasn't a fancy party",
  "i'm so sorry",
];

const PLACEHOLDER = 'Upload a 1080×1440 photo';

function carousel(sources: readonly string[] = SORRY_DEMO_STATIC_PATHS) {
  return createElement(SorryDemoCarousel, {
    sources: [...sources],
    captions: CAPTIONS.slice(0, sources.length),
  });
}

describe('isReadyDemoImage', () => {
  it('treats an already-decoded frame as ready and ignores an unfinished one', () => {
    expect(isReadyDemoImage({ complete: true, naturalWidth: 1080 })).toBe(true);
    expect(isReadyDemoImage({ complete: true, naturalWidth: 0 })).toBe(false);
    expect(isReadyDemoImage({ complete: false, naturalWidth: 1080 })).toBe(
      false
    );
    expect(isReadyDemoImage(null)).toBe(false);
  });
});

describe('SorryDemoCarousel sample slides', () => {
  it('prints the five demo photos on first paint, not the upload placeholder', () => {
    const html = renderToStaticMarkup(carousel());

    for (const src of SORRY_DEMO_STATIC_PATHS) {
      expect(html).toContain(`src="${src}"`);
    }
    expect(html).not.toContain('sr-only');
    expect(html).not.toContain('sorry-demo-placeholder');
    expect(html).not.toContain(PLACEHOLDER);
    expect(html).toContain('data-closing="true"');
    expect(html).toContain('i&#x27;m so sorry');
  });

  describe('after mount', () => {
    let root: Root | undefined;
    let container: HTMLDivElement | undefined;
    let restoreImages: (() => void) | undefined;

    afterEach(() => {
      if (root) {
        act(() => {
          root?.unmount();
        });
      }
      container?.remove();
      root = undefined;
      container = undefined;
      restoreImages?.();
      restoreImages = undefined;
    });

    function mount(sources?: readonly string[]) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root?.render(carousel(sources));
      });
      return container;
    }

    function stubImages(metrics: { complete: boolean; naturalWidth: number }) {
      const proto = HTMLImageElement.prototype;
      const complete = Object.getOwnPropertyDescriptor(proto, 'complete');
      const naturalWidth = Object.getOwnPropertyDescriptor(
        proto,
        'naturalWidth'
      );
      const addEventListener = proto.addEventListener;
      Object.defineProperty(proto, 'complete', {
        configurable: true,
        get: () => metrics.complete,
      });
      Object.defineProperty(proto, 'naturalWidth', {
        configurable: true,
        get: () => metrics.naturalWidth,
      });
      // Drop the load listener so a cache hit cannot be saved by onLoad.
      proto.addEventListener = function (type, listener, options) {
        if (type === 'load') return;
        return addEventListener.call(this, type, listener, options);
      };
      restoreImages = () => {
        if (complete) Object.defineProperty(proto, 'complete', complete);
        if (naturalWidth) {
          Object.defineProperty(proto, 'naturalWidth', naturalWidth);
        }
        proto.addEventListener = addEventListener;
      };
    }

    it('shows cached, already-complete photos when load never fires', () => {
      stubImages({ complete: true, naturalWidth: 1080 });
      const host = mount();
      const images = [...host.querySelectorAll('img')];

      expect(images.map((img) => img.getAttribute('src'))).toEqual([
        ...SORRY_DEMO_STATIC_PATHS,
      ]);
      for (const img of images) {
        expect(img.classList.contains('sr-only')).toBe(false);
        expect(isReadyDemoImage(img)).toBe(true);
      }
      expect(host.querySelector('.sorry-demo-placeholder')).toBeNull();
      expect(host.textContent).not.toContain(PLACEHOLDER);
      expect(host.querySelector('[data-closing="true"]')?.textContent).toBe(
        "i'm so sorry"
      );
    });

    it('keeps each photo mounted during a slow load', () => {
      stubImages({ complete: false, naturalWidth: 0 });
      const host = mount();

      expect(
        [...host.querySelectorAll('img')].map((img) => img.getAttribute('src'))
      ).toEqual([...SORRY_DEMO_STATIC_PATHS]);
      expect(host.querySelector('.sorry-demo-placeholder')).toBeNull();
      expect(host.textContent).not.toContain(PLACEHOLDER);
    });

    it('shows the upload placeholder when a frame fails or has no file', () => {
      const host = mount(['', SORRY_DEMO_STATIC_PATHS[1]]);
      const figures = [...host.querySelectorAll('figure')];

      expect(figures[0]?.querySelector('img')).toBeNull();
      expect(
        figures[0]?.querySelector('.sorry-demo-placeholder')?.textContent
      ).toBe(PLACEHOLDER);
      expect(figures[1]?.querySelector('img')?.getAttribute('src')).toBe(
        SORRY_DEMO_STATIC_PATHS[1]
      );

      act(() => {
        figures[1]?.querySelector('img')?.dispatchEvent(new Event('error'));
      });

      expect(figures[1]?.querySelector('img')).toBeNull();
      expect(
        figures[1]?.querySelector('.sorry-demo-placeholder')?.textContent
      ).toBe(PLACEHOLDER);
    });
  });
});
