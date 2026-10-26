import { describe, expect, it } from 'vitest';

import { clarityInitScript } from './clarity-tag';

type Tag = { src: string; async?: number };

function page(initial: Tag[] = []) {
  const scripts = [...initial];
  let created = 0;
  const window: {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown };
  } = {};
  const document = {
    createElement() {
      created += 1;
      return { src: '', async: 0 } satisfies Tag;
    },
    getElementsByTagName() {
      return [
        {
          parentNode: {
            insertBefore(node: Tag) {
              scripts.unshift(node);
            },
          },
        },
      ];
    },
    querySelector(selector: string) {
      if (selector !== "script[src*='clarity.ms/tag/']") return null;
      return (
        scripts.find((script) => script.src.includes('clarity.ms/tag/')) ?? null
      );
    },
  };
  return {
    window,
    document,
    scripts,
    created: () => created,
  };
}

function run(projectId: string, dom = page()) {
  const execute = new Function(
    'window',
    'document',
    clarityInitScript(projectId)
  );
  execute(dom.window, dom.document);
  return dom;
}

describe('clarity init script', () => {
  it('installs one tag and a queued stub', () => {
    const dom = run('abc123');
    expect(dom.created()).toBe(1);
    expect(dom.scripts.map((script) => script.src)).toEqual([
      'https://www.clarity.ms/tag/abc123',
    ]);
    expect(typeof dom.window.clarity).toBe('function');
    dom.window.clarity?.('event', 'page');
    expect(Array.isArray(dom.window.clarity?.q)).toBe(true);
  });

  it('skips insertion when clarity is already a function with a queue', () => {
    const dom = page();
    const queue: unknown[] = [];
    dom.window.clarity = Object.assign(() => undefined, { q: queue });

    run('abc123', dom);

    expect(dom.created()).toBe(0);
    expect(dom.scripts).toEqual([]);
    expect(dom.window.clarity.q).toBe(queue);
  });

  it('skips insertion when a clarity tag script is already on the page', () => {
    const dom = page([{ src: 'https://www.clarity.ms/tag/existing' }]);

    run('abc123', dom);

    expect(dom.created()).toBe(0);
    expect(dom.scripts).toEqual([
      { src: 'https://www.clarity.ms/tag/existing' },
    ]);
    expect(dom.window.clarity).toBeUndefined();
  });

  it('does not insert a second tag after the stub or the real tag is present', () => {
    const dom = run('abc123');
    run('abc123', dom);
    dom.window.clarity = () => undefined;
    run('abc123', dom);

    expect(dom.scripts).toHaveLength(1);
    expect(dom.created()).toBe(1);
  });

  it('inserts the tag when run, leaving scheduling to the caller', () => {
    const dom = page();
    const window = Object.assign(dom.window, {
      addEventListener() {
        throw new Error('clarity should not schedule itself');
      },
      requestIdleCallback() {
        throw new Error('clarity should not schedule itself');
      },
    });
    const document = Object.assign(dom.document, { readyState: 'loading' });
    const execute = new Function(
      'window',
      'document',
      clarityInitScript('abc123')
    );
    execute(window, document);
    expect(dom.scripts.map((script) => script.src)).toEqual([
      'https://www.clarity.ms/tag/abc123',
    ]);
    expect(clarityInitScript('abc123')).not.toContain('requestIdleCallback');
  });

  it('keeps a quote in the project id inside the script string', () => {
    const projectId = 'abc"def';
    expect(clarityInitScript(projectId)).toContain(JSON.stringify(projectId));
    const dom = run(projectId);
    expect(dom.scripts[0]?.src).toBe('https://www.clarity.ms/tag/abc"def');
  });
});
