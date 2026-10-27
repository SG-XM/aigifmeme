/**
 * @vitest-environment happy-dom
 */
import { act, createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CreateVideoTask } from '@/lib/create-video';

import { CreateVideo } from './create-video';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const pendingTask: CreateVideoTask = {
  id: 'task-1',
  status: 'pending',
  prompt: '',
  model: 'seedance-2-5',
  costCredits: 12,
  createdAt: '2026-10-27T00:00:00.000Z',
  files: [],
};

const harness = vi.hoisted(() => ({
  sessionPending: false,
  tasks: [] as CreateVideoTask[],
  create: vi.fn(async (_body?: unknown) => ({ status: 'queued' })),
  toastError: vi.fn(),
}));

vi.mock('@/core/auth/client', () => ({
  useSession: () => ({
    data: harness.sessionPending
      ? null
      : { user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' } },
    isPending: harness.sessionPending,
  }),
}));

vi.mock('@/core/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => createElement('a', { href, className }, children),
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => '/',
}));

vi.mock('@/paraglide/runtime.js', () => ({
  getLocale: () => 'en',
}));

vi.mock('@/paraglide/messages.js', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, prop) => () => (typeof prop === 'string' ? prop : ''),
    }
  ),
}));

vi.mock('@/lib/api-client', () => ({
  apiGet: async (url: string) => {
    if (url.startsWith('/api/agent/create-tasks'))
      return { tasks: harness.tasks };
    if (url.startsWith('/api/credits')) return { balance: 100000 };
    if (url.startsWith('/api/subscription-plans')) return [];
    return {};
  },
  apiPost: (url: string, body?: unknown) => {
    if (url === '/api/agent/create') return harness.create(body);
    return Promise.resolve();
  },
  apiUpload: async () => ({
    urls: ['https://cdn.example/face.jpg'],
  }),
}));

vi.mock('@/lib/create-draft', () => ({
  loadCreateDraft: async () => null,
  saveCreateDraft: async () => undefined,
  clearCreateDraft: async () => undefined,
}));

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => harness.toastError(...args) },
}));

function pendingTaskList() {
  return [pendingTask];
}

async function renderCreate(options?: { narrow?: boolean }) {
  if (options?.narrow) {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList;
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 80,
        top: 80,
        left: 0,
        right: 390,
        bottom: 720,
        width: 390,
        height: 640,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          CreateVideo as (props: {
            campaign: 'bulin';
            voice: 'uptown';
            embedded: boolean;
          }) => ReactNode,
          {
            campaign: 'bulin',
            voice: 'uptown',
            embedded: true,
          }
        )
      )
    );
  });
  return { container, root };
}

function submitButton(container: HTMLElement) {
  const button = container.querySelector('button[type="submit"]');
  if (!(button instanceof HTMLButtonElement))
    throw new Error('missing submit button');
  return button;
}

async function pickPhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error('missing file input');
  const file = new File(['face'], 'face.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitFor(() => {
    expect(container.querySelector('img[alt="face.jpg"]')).not.toBeNull();
  });
}

async function waitFor(assert: () => void) {
  let last: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assert();
      return;
    } catch (error) {
      last = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw last;
}

let mounted: Root | null = null;

afterEach(async () => {
  harness.sessionPending = false;
  harness.tasks = [];
  harness.create.mockReset();
  harness.create.mockResolvedValue({ status: 'queued' });
  harness.toastError.mockReset();
  if (mounted) {
    const root = mounted;
    mounted = null;
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
});

describe('create form unlocks after a job is queued', () => {
  it('clears photos and stays editable while that job is still running', async () => {
    harness.create.mockImplementation(async () => {
      harness.tasks = pendingTaskList();
      return { status: 'queued' };
    });
    const view = await renderCreate({ narrow: true });
    mounted = view.root;

    expect(view.container.querySelector('form')?.className).toContain(
      'is-docked'
    );
    await pickPhoto(view.container);
    await act(async () => {
      submitButton(view.container).click();
    });

    await waitFor(() => {
      const button = submitButton(view.container);
      expect(harness.create).toHaveBeenCalledOnce();
      expect(view.container.querySelector('img[alt="face.jpg"]')).toBeNull();
      expect(view.container.querySelector('.uptown-empty')).not.toBeNull();
      expect(
        (view.container.querySelector('.uptown-empty') as HTMLButtonElement)
          .disabled
      ).toBe(false);
      expect(
        (view.container.querySelector('.uptown-length') as HTMLFieldSetElement)
          .disabled
      ).toBe(false);
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain('create.generate');
      expect(button.textContent).not.toContain('create.generating');
      expect(
        view.container.querySelector('[aria-label="create.active_tasks"]')
      ).not.toBeNull();
    });
  });

  it('does not lock the form just because a task is already running', async () => {
    harness.tasks = pendingTaskList();
    const view = await renderCreate();
    mounted = view.root;
    await waitFor(() => {
      const button = submitButton(view.container);
      expect(
        view.container.querySelector('[aria-label="create.active_tasks"]')
      ).not.toBeNull();
      expect(button.disabled).toBe(false);
      expect(button.textContent).not.toContain('create.generating');
      expect(
        (view.container.querySelector('.uptown-empty') as HTMLButtonElement)
          .disabled
      ).toBe(false);
    });
  });

  it('toasts a rate limit and leaves the form usable', async () => {
    harness.create.mockRejectedValue(new Error('Please retry after 5s.'));
    const view = await renderCreate({ narrow: true });
    mounted = view.root;
    await pickPhoto(view.container);
    await act(async () => {
      submitButton(view.container).click();
    });

    await waitFor(() => {
      const button = submitButton(view.container);
      expect(harness.toastError).toHaveBeenCalledWith('Please retry after 5s.');
      expect(
        view.container.querySelector('img[alt="face.jpg"]')
      ).not.toBeNull();
      expect(button.disabled).toBe(false);
      expect(button.textContent).not.toContain('create.generating');
      expect(
        (
          view.container.querySelector(
            '.uptown-empty'
          ) as HTMLButtonElement | null
        )?.disabled ?? false
      ).toBe(false);
      expect(
        (view.container.querySelector('.uptown-length') as HTMLFieldSetElement)
          .disabled
      ).toBe(false);
    });
  });

  it('does not show the generating label while the session is still loading', async () => {
    harness.sessionPending = true;
    const view = await renderCreate({ narrow: true });
    mounted = view.root;
    const button = submitButton(view.container);
    expect(button.textContent).not.toContain('create.generating');
    expect(
      (view.container.querySelector('.uptown-empty') as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });
});
