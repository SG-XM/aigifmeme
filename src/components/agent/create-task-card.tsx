import { Loader2 } from 'lucide-react';

import { labelForGeneratedModel } from '@/lib/agent-settings';
import type { CreateVideoTask } from '@/lib/create-video';

export interface CreateTaskStatusLabels {
  pending: string;
  processing: string;
  success: string;
  failed: string;
  canceled: string;
}

export function CreateTaskCard({
  task,
  labels,
  costLabel,
  sourceLabels,
}: {
  task: CreateVideoTask;
  labels: CreateTaskStatusLabels;
  costLabel: string;
  sourceLabels?: {
    video: string;
    audio: string;
    from7s: string;
    from4s: string;
    bridgesVideo: string;
    bridgesAudio: string;
    peeperVideo: string;
    peeperAudio: string;
    trioVideo: string;
    trioAudio: string;
  };
}) {
  const active = task.status === 'pending' || task.status === 'processing';
  const statusLabel =
    labels[task.status as keyof CreateTaskStatusLabels] ?? task.status;

  return (
    <article className="bg-card overflow-hidden rounded-xl border">
      {task.files[0] ? (
        <video
          src={task.files[0]}
          controls
          playsInline
          preload="metadata"
          className="max-h-96 w-full bg-black"
        />
      ) : task.imagePreview ? (
        <div className="bg-muted relative aspect-video overflow-hidden">
          <img
            src={task.imagePreview}
            alt=""
            className="size-full object-contain"
          />
          {active && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35">
              <span className="flex items-center gap-2 rounded-full bg-black/65 px-3 py-2 text-sm text-white">
                <Loader2 className="size-4 animate-spin" />
                {statusLabel}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          role="status"
          className="bg-muted/30 flex min-h-28 items-center justify-center gap-3 p-5"
        >
          {active && <Loader2 className="text-primary size-5 animate-spin" />}
          <p className="text-sm">{statusLabel}</p>
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{statusLabel}</p>
          <p className="text-muted-foreground text-xs">
            {labelForGeneratedModel(task.model)}
            <span aria-hidden="true"> · </span>
            {costLabel}
          </p>
        </div>
        {sourceLabels &&
          (task.referenceVideoVersion || task.soundtrackVersion) && (
            <div className="text-muted-foreground space-y-1 text-xs">
              {task.referenceVideoVersion && (
                <p>
                  {sourceLabels.video}:{' '}
                  {task.referenceVideoVersion === 'from7s15s'
                    ? sourceLabels.from7s
                    : task.referenceVideoVersion === 'from4s15s'
                      ? sourceLabels.from4s
                      : task.referenceVideoVersion === 'trio12' ||
                          task.referenceVideoVersion === 'trio15'
                        ? sourceLabels.trioVideo
                        : task.referenceVideoVersion === 'windowPeeper'
                          ? sourceLabels.peeperVideo
                          : sourceLabels.bridgesVideo}
                </p>
              )}
              {task.soundtrackVersion && (
                <p>
                  {sourceLabels.audio}:{' '}
                  {task.soundtrackVersion === 'from7s15s'
                    ? sourceLabels.from7s
                    : task.soundtrackVersion === 'from4s15s'
                      ? sourceLabels.from4s
                      : task.soundtrackVersion === 'trio12' ||
                          task.soundtrackVersion === 'trio15'
                        ? sourceLabels.trioAudio
                        : task.soundtrackVersion === 'windowPeeper'
                          ? sourceLabels.peeperAudio
                          : sourceLabels.bridgesAudio}
                </p>
              )}
            </div>
          )}
        {task.error && <p className="text-destructive text-sm">{task.error}</p>}
      </div>
    </article>
  );
}
