import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Film, Play } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { agentLibraryQueryKey } from '@/lib/agent-library-query';
import { labelForGeneratedModel } from '@/lib/agent-settings';
import { apiGet } from '@/lib/api-client';
import type { CreateVideoTask } from '@/lib/create-video';
import {
  createTasksNeedPolling,
  flattenCreateTasks,
  flattenLibraryImages,
} from '@/lib/library-pages';
import { isVideoUrl } from '@/lib/media';
import { m } from '@/paraglide/messages.js';
import { useAgentHeader } from '@/components/agent/agent-header-context';
import { CreateTaskCard } from '@/components/agent/create-task-card';
import { usePreviewPane } from '@/components/agent/preview-pane-context';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/(agent)/library')({
  component: LibraryPage,
});

interface LibraryImage {
  id: string;
  src: string;
  name: string;
  alt: string;
  chatId: string;
  chatTitle: string;
  createdAt: string;
  model?: string;
}

interface LibraryData {
  images?: LibraryImage[];
  nextCursor?: string;
}

interface CreateTasksPage {
  tasks: CreateVideoTask[];
  nextCursor?: string;
}

interface SorrySet {
  id: string;
  status: string;
  styleId?: string;
  createdAt: string;
  slides: { url: string; caption: string }[];
}

function LibraryPage() {
  const { setContent: setHeaderContent } = useAgentHeader();
  const {
    setOpen,
    clearMedia,
    setImages,
    openMedia: openPreviewMedia,
  } = usePreviewPane();
  const libraryQuery = useInfiniteQuery({
    queryKey: agentLibraryQueryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiGet<LibraryData>(
        pageParam
          ? `/api/agent/library?cursor=${encodeURIComponent(pageParam)}`
          : '/api/agent/library'
      ),
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
  });

  const createTasks = useInfiniteQuery({
    queryKey: ['create-task-history'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiGet<CreateTasksPage>(
        pageParam
          ? `/api/agent/create-tasks?limit=20&cursor=${encodeURIComponent(pageParam)}`
          : '/api/agent/create-tasks?limit=20'
      ),
    getNextPageParam: (lastPage) => lastPage?.nextCursor,
    refetchInterval: (query) =>
      createTasksNeedPolling(query.state.data?.pages) ? 5000 : false,
  });
  const taskHistory = useMemo(
    () => flattenCreateTasks(createTasks.data?.pages),
    [createTasks.data]
  );
  const completed = taskHistory
    .filter((task) => task.status === 'success')
    .map((task) => task.id)
    .join('|');
  useEffect(() => {
    void libraryQuery.refetch();
  }, [completed]);

  const images = useMemo(
    () => flattenLibraryImages(libraryQuery.data?.pages),
    [libraryQuery.data]
  );
  const setsQuery = useQuery({
    queryKey: ['sorry-sets'],
    queryFn: () => apiGet<{ sets: SorrySet[] }>('/api/im-so-sorry'),
    refetchInterval: (query) =>
      (query.state.data?.sets ?? []).some((set) =>
        ['pending', 'processing'].includes(set.status)
      )
        ? 4000
        : false,
  });
  const sets = setsQuery.data?.sets ?? [];

  const taskStatusLabels = {
    pending: m['create.task_pending'](),
    processing: m['create.task_processing'](),
    success: m['create.task_success'](),
    failed: m['create.task_failed'](),
    canceled: m['create.task_canceled'](),
  };

  useEffect(() => {
    setHeaderContent({ title: m['agent.library.title']() });
    return () => setHeaderContent({});
  }, [setHeaderContent]);

  useEffect(() => {
    setOpen(false);
    clearMedia();
    return () => {
      setImages([]);
      clearMedia();
      setOpen(false);
    };
  }, [clearMedia, setImages, setOpen]);

  useEffect(() => {
    setImages(
      images.map((image) => ({
        src: image.src,
        alt: image.alt,
        name: image.name,
      }))
    );
  }, [images, setImages]);

  function openMedia(image: LibraryImage) {
    openPreviewMedia({ src: image.src, name: image.name, alt: image.alt });
  }

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-6xl">
        {(taskHistory.length > 0 || createTasks.isError) && (
          <section aria-label={m['create.task_history']()} className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">
              {m['create.task_history']()}
            </h2>
            {createTasks.isError && (
              <div role="alert" className="text-destructive mb-4 text-sm">
                {m['create.tasks_error']()}{' '}
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void createTasks.refetch()}
                >
                  {m['create.retry']()}
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {taskHistory.map((task) => (
                <CreateTaskCard
                  key={task.id}
                  task={task}
                  costLabel={m['create.cost']({ count: task.costCredits })}
                  labels={taskStatusLabels}
                />
              ))}
            </div>
            {createTasks.hasNextPage && (
              <div className="mt-5 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => void createTasks.fetchNextPage()}
                  disabled={createTasks.isFetchingNextPage}
                >
                  {createTasks.isFetchingNextPage
                    ? m['agent.library.loading']()
                    : m['create.load_more_tasks']()}
                </Button>
              </div>
            )}
          </section>
        )}

        {sets.length > 0 && (
          <section aria-label={m['sorry.library_title']()} className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">
              {m['sorry.library_title']()}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {sets.map((set) => (
                <Link
                  key={set.id}
                  href={`/im-so-sorry?task=${encodeURIComponent(set.id)}`}
                  className="border-border bg-card hover:border-primary/50 block rounded-lg border p-3"
                >
                  <p className="text-sm font-medium">
                    {m['sorry.library_slides']({ count: set.slides.length })}
                  </p>
                  {set.status === 'failed' ? (
                    <p className="text-destructive mt-1 text-xs">
                      {m['sorry.failed']()}
                    </p>
                  ) : (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {set.slides.map((slide) => (
                        <img
                          key={slide.url}
                          src={slide.url}
                          alt={slide.caption}
                          className="aspect-[3/4] h-36 shrink-0 rounded-md object-cover"
                        />
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {(libraryQuery.isLoading ||
          setsQuery.isLoading ||
          createTasks.isLoading) &&
        images.length === 0 &&
        taskHistory.length === 0 &&
        sets.length === 0 ? (
          <LibraryState text={m['agent.library.loading']()} />
        ) : images.length === 0 &&
          taskHistory.length === 0 &&
          sets.length === 0 ? (
          <LibraryState
            text={m['agent.library.empty']()}
            muted={m['agent.library.empty_description']()}
          />
        ) : images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => openMedia(image)}
                className="group border-border bg-card hover:border-primary/50 min-w-0 overflow-hidden rounded-lg border text-left transition-colors"
              >
                {/* Clips are shot in 16:9 or 9:16 far more often than square,
                    so the tile is a video frame rather than the image grid's
                    square. */}
                <div className="bg-muted relative aspect-video overflow-hidden">
                  <LibraryMediaThumb
                    src={image.src}
                    alt={image.alt || image.name}
                    className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  {isVideoUrl(image.src) && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10">
                      <span className="flex size-9 items-center justify-center rounded-full bg-black/55 backdrop-blur">
                        <Play className="size-4 fill-white text-white" />
                      </span>
                    </span>
                  )}
                </div>
                <div className="min-w-0 px-3 py-2">
                  <p className="text-muted-foreground truncate text-xs">
                    {image.chatTitle}
                  </p>
                  {image.model && (
                    <p className="text-muted-foreground/70 mt-0.5 truncate text-[11px]">
                      {labelForGeneratedModel(image.model)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {libraryQuery.hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => libraryQuery.fetchNextPage()}
              disabled={libraryQuery.isFetchingNextPage}
            >
              {libraryQuery.isFetchingNextPage
                ? m['agent.library.loading']()
                : m['agent.library.load_more']()}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryState({ text, muted }: { text: string; muted?: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
      <div className="border-border bg-muted/40 flex size-12 items-center justify-center rounded-lg border">
        <Film className="text-muted-foreground size-5" />
      </div>
      <p className="mt-3 text-sm font-medium">{text}</p>
      {muted && <p className="text-muted-foreground mt-1 text-xs">{muted}</p>}
    </div>
  );
}

function LibraryMediaThumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  if (isVideoUrl(src)) {
    // No controls and metadata-only: this is a poster frame in a grid that
    // can hold a hundred clips, not a player. Playback happens in the chat.
    return (
      <video
        src={src}
        aria-label={alt || undefined}
        muted
        playsInline
        preload="metadata"
        className={className}
      />
    );
  }
  return <img src={src} alt={alt} className={className} />;
}
