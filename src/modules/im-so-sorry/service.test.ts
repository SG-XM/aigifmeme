import { beforeEach, describe, expect, it, vi } from 'vitest';

import { planSorrySet } from '@/lib/im-so-sorry';

import { createSorrySet, refreshSorryTask } from './service';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  replace: vi.fn(),
  update: vi.fn(),
  configs: vi.fn(),
  storage: vi.fn(),
}));

vi.mock('@/modules/ai-tasks/service', () => ({
  AITaskStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELED: 'canceled',
  },
  createTask: mocks.create,
  findTask: mocks.find,
  replaceTaskInfo: mocks.replace,
  updateTask: mocks.update,
}));
vi.mock('@/modules/config/service', () => ({
  getAllConfigs: mocks.configs,
}));
vi.mock('@/modules/storage/service', () => ({
  getStorage: mocks.storage,
}));
vi.mock('@/core/db', () => ({ db: () => ({}) }));

const photo = 'https://cdn.example.com/photo.jpg';
const original = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const edited = new Uint8Array([0xff, 0xd8, 0xff, 2]);

function seed(overrides: Record<string, unknown> = {}) {
  const plan = planSorrySet({
    styleId: 'halloween',
    lieIds: ['wig', 'costume', 'party', 'makeup'],
  });
  const row = {
    id: 'task-1',
    userId: 'user-1',
    scene: 'im-so-sorry',
    status: 'pending',
    createdAt: new Date(),
    taskInfo: JSON.stringify({
      creditId: 'credit-1',
      sorry: {
        photoUrl: photo,
        styleId: plan.styleId,
        lieIds: plan.lieIds,
        costumeNote: '',
        locale: 'en',
        captions: plan.captions,
        closing: plan.closing,
        phase: 'edit',
        editIndex: 0,
        rawUrls: [],
        slides: [],
        composeIndex: 0,
        lockUntil: 0,
      },
    }),
    taskResult: null,
    ...overrides,
  };
  mocks.find.mockImplementation(async () => row);
  mocks.replace.mockImplementation(async (params) => {
    if (row.taskInfo !== params.previous) return false;
    if (row.status !== 'pending' && row.status !== 'processing') return false;
    row.taskInfo = params.next;
    if (params.status) row.status = params.status;
    return true;
  });
  mocks.update.mockImplementation(async (params) => {
    row.status = params.status;
    row.taskResult = JSON.stringify(params.taskResult);
    return row;
  });
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configs.mockResolvedValue({ kie_api_key: 'test-key' });
  mocks.storage.mockResolvedValue({
    getPublicUrl: () => 'https://cdn.example.com/uploads/reference',
    uploadFile: vi.fn(),
  });
  mocks.create.mockResolvedValue({ id: 'task-1' });
});

describe('im so sorry set', () => {
  it('charges 5 credits and keeps creditId beside the pipeline', async () => {
    await createSorrySet({
      userId: 'user-1',
      photoUrl: photo,
      styleId: 'halloween',
      lieIds: ['wig'],
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        costCredits: 5,
        mediaType: 'image',
        model: 'google/nano-banana-edit',
        scene: 'im-so-sorry',
      })
    );
    const info = mocks.create.mock.calls[0][0].taskInfo;
    expect(info.sorry.lieIds).toEqual(['wig']);
    expect(info.sorry.closing).toBe("i'm so sorry");
    expect(info.creditId).toBeUndefined();
  });

  it('does not charge when storage cannot host the photo', async () => {
    mocks.storage.mockResolvedValue(null);
    await expect(
      createSorrySet({
        userId: 'user-1',
        photoUrl: photo,
        styleId: 'halloween',
        lieIds: ['wig'],
      })
    ).rejects.toThrow(/Storage/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('edits once per lie, then burns the original as the last slide', async () => {
    const row = seed();
    let kie = 0;
    const generated: { prompt: string; imageUrl: string }[] = [];
    const burned: { caption: string; closing: boolean; bytes: Uint8Array }[] =
      [];
    const runtime = {
      now: () => Date.now(),
      generate: async (prompt: string, imageUrl: string) => {
        generated.push({ prompt, imageUrl });
        kie += 1;
        return { taskId: `kie-${kie}` };
      },
      query: async () => ({
        status: 'success' as const,
        url: `https://files.example/out-${kie}.jpg`,
      }),
      fetchBytes: async (url: string) => (url === photo ? original : edited),
      upload: async (key: string) => `https://cdn.example.com/${key}`,
      burn: async (bytes: Uint8Array, caption: string, closing: boolean) => {
        burned.push({ caption, closing, bytes });
        return bytes;
      },
    };
    for (let step = 0; step < 20 && row.status !== 'success'; step += 1) {
      await refreshSorryTask(row.id, runtime);
    }
    expect(row.status).toBe('success');
    expect(generated).toHaveLength(4);
    expect(generated[0].imageUrl).toBe(photo);
    expect(generated[0].prompt).toContain('perfect wig/hair');
    expect(generated[0].prompt).toContain('Remove DIY artifacts');
    expect(generated[1].imageUrl).toBe(
      'https://cdn.example.com/sorry/task-1/raw-0.jpg'
    );
    expect(generated[1].prompt).toContain(
      'replace the perfect wig with a cheap yellow store wig'
    );
    expect(generated.some((call) => call.prompt.includes("i'm so sorry"))).toBe(
      false
    );
    expect(burned.map((slide) => slide.caption)).toEqual([
      'this was my halloween costume',
      "ok i lied, my wig wasn't that good",
      "my costume wasn't that expensive either",
      "and it wasn't a fancy party",
      "i'm so sorry",
    ]);
    expect(burned[4].closing).toBe(true);
    expect(burned[4].bytes).toBe(original);
    expect(burned[0].bytes).toBe(edited);
    const saved = JSON.parse(row.taskInfo as string);
    expect(saved.creditId).toBe('credit-1');
  });

  it('returns the whole charge when the provider rejects the edit', async () => {
    const row = seed();
    const runtime = {
      now: () => Date.now(),
      generate: async () => ({ taskId: 'kie-1' }),
      query: async () => ({ status: 'failed' as const }),
      fetchBytes: async () => original,
      upload: async (key: string) => `https://cdn.example.com/${key}`,
      burn: async (bytes: Uint8Array) => bytes,
    };
    await refreshSorryTask(row.id, runtime);
    await refreshSorryTask(row.id, runtime);
    expect(row.status).toBe('failed');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('keeps the charge when a status check fails on the network', async () => {
    const row = seed();
    const runtime = {
      now: () => Date.now(),
      generate: async () => ({ taskId: 'kie-1' }),
      query: async () => {
        throw new Error('socket hang up');
      },
      fetchBytes: async () => original,
      upload: async (key: string) => `https://cdn.example.com/${key}`,
      burn: async (bytes: Uint8Array) => bytes,
    };
    await refreshSorryTask(row.id, runtime);
    await refreshSorryTask(row.id, runtime);
    expect(row.status).toBe('processing');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(JSON.parse(row.taskInfo as string).sorry.lockUntil).toBe(0);
  });

  it('refunds when the set is still unfinished after 15 minutes', async () => {
    const row = seed({ createdAt: new Date(Date.now() - 16 * 60 * 1000) });
    await refreshSorryTask(row.id, {
      now: () => Date.now(),
      generate: async () => ({ taskId: 'kie-1' }),
      query: async () => ({ status: 'pending' as const }),
      fetchBytes: async () => original,
      upload: async () => photo,
      burn: async (bytes: Uint8Array) => bytes,
    });
    expect(row.status).toBe('failed');
  });
});
