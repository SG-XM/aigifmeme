// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HOME_CREATE_ELEMENT_ID,
  homeCreateScrollBehavior,
  isHomeCreateAligned,
  isRecentHistoryRestore,
  resetHomeCreateScrollForTests,
  scrollHomeCreateIntoView,
  shouldAutoScrollHomeToCreate,
  watchHomeCreateScroll,
} from './home-create-scroll';

function rect(top: number, height = 0): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 0,
    bottom: top + height,
    width: 0,
    height,
    toJSON() {
      return {};
    },
  };
}

function mountCreate(top: number) {
  const el = document.createElement('div');
  el.id = HOME_CREATE_ELEMENT_ID;
  el.style.scrollMarginTop = '96px';
  el.getBoundingClientRect = () => rect(top);
  const scrollIntoView = vi.fn();
  el.scrollIntoView = scrollIntoView;
  document.body.appendChild(el);
  return { el, scrollIntoView };
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}

afterEach(() => {
  document.body.replaceChildren();
  window.location.hash = '';
  resetHomeCreateScrollForTests();
  mockReducedMotion(false);
});

describe('shouldAutoScrollHomeToCreate', () => {
  it('targets the photo picker on a fresh homepage and on #create', () => {
    expect(shouldAutoScrollHomeToCreate('')).toBe(true);
    expect(shouldAutoScrollHomeToCreate('#')).toBe(true);
    expect(shouldAutoScrollHomeToCreate('#create')).toBe(true);
    expect(shouldAutoScrollHomeToCreate('create')).toBe(true);
  });

  it('leaves other section hashes alone', () => {
    expect(shouldAutoScrollHomeToCreate('#about')).toBe(false);
    expect(shouldAutoScrollHomeToCreate('#faq')).toBe(false);
    expect(shouldAutoScrollHomeToCreate('#hero')).toBe(false);
  });
});

describe('scrollHomeCreateIntoView', () => {
  it('scrolls #create to the start so scroll-margin clears the header', () => {
    const { scrollIntoView } = mountCreate(900);
    expect(
      isHomeCreateAligned(window, document.getElementById('create')!)
    ).toBe(false);

    expect(scrollHomeCreateIntoView(window, 'smooth')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });

  it('does not move the page when a different hash was requested', () => {
    const { scrollIntoView } = mountCreate(900);
    window.location.hash = '#about';

    expect(scrollHomeCreateIntoView(window, 'smooth')).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll again when #create is already under the sticky header', () => {
    const { scrollIntoView } = mountCreate(96);

    expect(scrollHomeCreateIntoView(window, 'instant')).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('smooth-scrolls by default and jumps when reduced motion is on', () => {
    mockReducedMotion(false);
    expect(homeCreateScrollBehavior(window)).toBe('smooth');

    mockReducedMotion(true);
    expect(homeCreateScrollBehavior(window)).toBe('instant');
    const { scrollIntoView } = mountCreate(900);
    expect(scrollHomeCreateIntoView(window)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
      inline: 'nearest',
      behavior: 'instant',
    });
  });

  it('keeps the upload card below a sticky header taller than scroll-mt-24', () => {
    const header = document.createElement('header');
    header.getBoundingClientRect = () => rect(0, 140);
    document.body.appendChild(header);
    const { el, scrollIntoView } = mountCreate(900);

    expect(scrollHomeCreateIntoView(window, 'smooth')).toBe(true);
    expect(el.style.scrollMarginTop).toBe('148px');
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start', behavior: 'smooth' })
    );
  });
});

async function flushLayout() {
  await Promise.resolve();
  for (let frame = 0; frame < 4; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

describe('watchHomeCreateScroll', () => {
  it('scrolls once the document has finished loading', async () => {
    const { scrollIntoView } = mountCreate(900);
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    });

    const stop = watchHomeCreateScroll(window);
    await flushLayout();

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({
        block: 'start',
        inline: 'nearest',
        behavior: 'smooth',
      })
    );
    stop();
  });

  it('does not steal the viewport after the reader starts scrolling', async () => {
    const { scrollIntoView } = mountCreate(900);
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });

    const stop = watchHomeCreateScroll(window);
    window.dispatchEvent(new Event('wheel'));
    window.dispatchEvent(new Event('load'));
    await flushLayout();

    expect(scrollIntoView).not.toHaveBeenCalled();
    stop();
  });

  it('keeps a back/forward restore instead of jumping to the photo picker', () => {
    mountCreate(900);
    window.dispatchEvent(new Event('popstate'));
    expect(isRecentHistoryRestore()).toBe(true);

    const scrollIntoView = vi.spyOn(
      document.getElementById('create')!,
      'scrollIntoView'
    );
    const stop = watchHomeCreateScroll(window);
    expect(scrollIntoView).not.toHaveBeenCalled();
    stop();
  });

  it('jumps to the photo picker when reduced motion is requested', async () => {
    mockReducedMotion(true);
    const { scrollIntoView } = mountCreate(900);
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    });

    const stop = watchHomeCreateScroll(window);
    await flushLayout();

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'instant' })
    );
    stop();
  });
});
