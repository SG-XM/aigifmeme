import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  agentLibraryQueryKey,
  settingsLibraryCountQueryKey,
} from './agent-library-query';

const finiteLibrary = {
  images: [{ id: 'clip-1' }],
  nextCursor: 'next',
};

function libraryObserver(client: QueryClient, queryKey: readonly unknown[]) {
  return new InfiniteQueryObserver(client, {
    queryKey,
    queryFn: async () => ({ images: [], nextCursor: undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: { nextCursor?: string } | undefined) =>
      lastPage?.nextCursor,
  });
}

describe('agent library query keys', () => {
  it('does not let the settings count occupy the infinite library cache', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(settingsLibraryCountQueryKey, finiteLibrary);

    const observer = libraryObserver(client, agentLibraryQueryKey);

    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(settingsLibraryCountQueryKey)).toEqual(
      finiteLibrary
    );
  });

  it('still refreshes the settings count from the library prefix', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(settingsLibraryCountQueryKey, finiteLibrary);

    await client.invalidateQueries({ queryKey: ['agent-library'] });

    expect(
      client.getQueryState(settingsLibraryCountQueryKey)?.isInvalidated
    ).toBe(true);
    expect(settingsLibraryCountQueryKey.slice(0, 1)).toEqual([
      ...agentLibraryQueryKey,
    ]);
  });

  it('throws when an infinite observer reads the finite library payload', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(agentLibraryQueryKey, finiteLibrary);

    expect(() => libraryObserver(client, agentLibraryQueryKey)).toThrow(
      /length/
    );
  });
});
