/** Reads used by the library page when an infinite-query cache has a bad shape. */

export function createTasksNeedPolling(
  pages:
    | readonly (
        | {
            tasks?: readonly { status: string }[] | null;
          }
        | null
        | undefined
      )[]
    | null
    | undefined
) {
  return (pages ?? []).some((page) =>
    (page?.tasks ?? []).some((task) =>
      ['pending', 'processing'].includes(task.status)
    )
  );
}

export function flattenCreateTasks<T>(
  pages:
    | readonly ({ tasks?: T[] | null } | null | undefined)[]
    | null
    | undefined
): T[] {
  return pages?.flatMap((page) => page?.tasks ?? []) ?? [];
}

export function flattenLibraryImages<T extends { chatId: string }>(
  pages:
    | readonly ({ images?: T[] | null } | null | undefined)[]
    | null
    | undefined
): T[] {
  return (
    pages
      ?.flatMap((page) => page?.images ?? [])
      .filter((image) => image.chatId !== '') ?? []
  );
}
