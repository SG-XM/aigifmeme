import { describe, expect, it } from 'vitest';

import {
  createTasksNeedPolling,
  flattenCreateTasks,
  flattenLibraryImages,
} from './library-pages';

describe('library page reads', () => {
  it('turns a missing infinite-query shape into an empty list', () => {
    expect(flattenCreateTasks(undefined)).toEqual([]);
    expect(flattenCreateTasks(null)).toEqual([]);
    expect(flattenLibraryImages(undefined)).toEqual([]);
    expect(flattenLibraryImages(null)).toEqual([]);
    expect(createTasksNeedPolling(undefined)).toBe(false);
    expect(createTasksNeedPolling(null)).toBe(false);
  });

  it('ignores pages that have no tasks or images', () => {
    expect(
      flattenCreateTasks([
        undefined,
        null,
        {},
        { tasks: undefined },
        { tasks: [{ id: 'task-1', status: 'success' }] },
      ])
    ).toEqual([{ id: 'task-1', status: 'success' }]);
    expect(
      flattenLibraryImages([
        null,
        {},
        { images: undefined },
        {
          images: [
            { id: 'kept', chatId: 'chat-1' },
            { id: 'draft', chatId: '' },
          ],
        },
      ])
    ).toEqual([{ id: 'kept', chatId: 'chat-1' }]);
  });

  it('polls only while a create task is still running', () => {
    expect(createTasksNeedPolling([{ tasks: [{ status: 'success' }] }])).toBe(
      false
    );
    expect(
      createTasksNeedPolling([
        { tasks: [{ status: 'success' }] },
        { tasks: [{ status: 'pending' }] },
      ])
    ).toBe(true);
    expect(
      createTasksNeedPolling([{ tasks: [{ status: 'processing' }] }])
    ).toBe(true);
  });
});
