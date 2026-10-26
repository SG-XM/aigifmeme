import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  or,
} from 'drizzle-orm';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { aiTask, user, type AiTask } from '@/config/db/schema';
import {
  consume,
  requireCurrentCreditPricing,
  revoke,
} from '@/modules/credits/service';
import { getUuid } from '@/lib/hash';

export enum AITaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/** Paginated AI generation history across all users, for the admin console. */
export async function listAllAiTasks(params: {
  page: number;
  pageSize: number;
  search?: string;
}) {
  const { page, pageSize, search } = params;
  const where = and(
    isNull(aiTask.deletedAt),
    search
      ? or(
          like(aiTask.prompt, `%${search}%`),
          like(user.email, `%${search}%`),
          like(user.name, `%${search}%`),
          like(aiTask.model, `%${search}%`)
        )
      : undefined
  );

  const [totalResult] = await db()
    .select({ count: count() })
    .from(aiTask)
    .innerJoin(user, eq(aiTask.userId, user.id))
    .where(where);

  const items = await db()
    .select({
      id: aiTask.id,
      userId: aiTask.userId,
      userName: user.name,
      userEmail: user.email,
      mediaType: aiTask.mediaType,
      provider: aiTask.provider,
      model: aiTask.model,
      prompt: aiTask.prompt,
      status: aiTask.status,
      taskId: aiTask.taskId,
      options: aiTask.options,
      createdAt: aiTask.createdAt,
      costCredits: aiTask.costCredits,
      taskResult: aiTask.taskResult,
    })
    .from(aiTask)
    .innerJoin(user, eq(aiTask.userId, user.id))
    .where(where)
    .orderBy(desc(aiTask.createdAt), desc(aiTask.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items, total: totalResult.count };
}

/**
 * Create an AI task with optional credit consumption.
 */
export async function createTask(params: {
  userId: string;
  mediaType: string;
  provider: string;
  model: string;
  prompt: string;
  costCredits?: number;
  options?: any;
  /** Stored beside creditId. Callers must not drop creditId later. */
  taskInfo?: Record<string, unknown>;
  scene?: string;
}): Promise<any> {
  const { userId, mediaType, provider, model, prompt, costCredits, options } =
    params;

  if (costCredits && costCredits > 0) await requireCurrentCreditPricing();

  if (!Number.isSafeInteger(costCredits ?? 0) || (costCredits ?? 0) < 0)
    throw new Error('Task credits must be a non-negative integer');
  if (envConfigs.database_provider === 'd1' && costCredits && costCredits > 0) {
    const task = {
      id: getUuid(),
      userId,
      mediaType,
      provider,
      model,
      prompt,
      status: AITaskStatus.PENDING,
      costCredits,
      scene: params.scene ?? '',
      options: options ? JSON.stringify(options) : null,
    };
    const result = await consume({
      userId,
      credits: costCredits,
      scene: 'ai_task',
      description: `AI ${mediaType} generation · ${model}`,
      metadata: JSON.stringify({ taskId: task.id, provider, model }),
      d1AdditionalWrites: (creditId) => [
        db()
          .insert(aiTask)
          .values({
            ...task,
            taskInfo: JSON.stringify({
              creditId,
              ...(params.taskInfo ?? {}),
            }),
          })
          .toSQL(),
      ],
    });
    if (!result.success) throw new Error('Insufficient credits');
    return task;
  }

  return db().transaction(async (tx: any) => {
    // 1. Insert task
    const taskData: any = {
      id: getUuid(),
      userId,
      mediaType,
      provider,
      model,
      prompt,
      status: AITaskStatus.PENDING,
      costCredits: costCredits || 0,
      scene: params.scene ?? '',
      options: options ? JSON.stringify(options) : null,
    };

    const [task] = await tx.insert(aiTask).values(taskData).returning();

    // 2. Consume credits if cost > 0
    if (costCredits && costCredits > 0) {
      const result = await consume({
        userId,
        credits: costCredits,
        scene: 'ai_task',
        // The model belongs on the ledger line itself: a statement of
        // identical "-40"s is unreadable, and the taskId in metadata only
        // answers the question after a second lookup.
        description: `AI ${mediaType} generation · ${model}`,
        metadata: JSON.stringify({ taskId: task.id, provider, model }),
        tx,
      });

      if (!result.success) {
        throw new Error('Insufficient credits');
      }

      // Store consumed credit ID for potential revocation. Extra pipeline
      // state is merged in the same object so a later rewrite can keep it.
      const taskInfo = {
        ...(result.consumedCredit
          ? { creditId: result.consumedCredit.id }
          : {}),
        ...(params.taskInfo ?? {}),
      };
      if (Object.keys(taskInfo).length > 0) {
        await tx
          .update(aiTask)
          .set({ taskInfo: JSON.stringify(taskInfo) })
          .where(eq(aiTask.id, task.id));
      }
    } else if (params.taskInfo) {
      await tx
        .update(aiTask)
        .set({ taskInfo: JSON.stringify(params.taskInfo) })
        .where(eq(aiTask.id, task.id));
    }

    return task;
  });
}

/** Update task status. Failed or user-canceled work returns its credits. */
export async function updateTask(params: {
  taskId: string;
  status: AITaskStatus;
  taskResult?: any;
}) {
  const { taskId, status, taskResult } = params;

  const [task] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);

  if (!task) throw new Error('Task not found');

  // Terminal states are immutable. Every success/failure/cancel competes for
  // the same PENDING/PROCESSING row, and whichever transition commits first
  // wins without a later poll overwriting it.
  const updateData: any = { status };
  if (taskResult) {
    updateData.taskResult = JSON.stringify(taskResult);
  }

  await db()
    .update(aiTask)
    .set(updateData)
    .where(
      and(
        eq(aiTask.id, taskId),
        inArray(aiTask.status, [AITaskStatus.PENDING, AITaskStatus.PROCESSING])
      )
    );

  const updatedTask = await findTask(taskId);
  if (!updatedTask) throw new Error('Task not found after update');

  // Revoke credits on failure or cancellation. `revoke` is idempotent: only
  // an active consumption record can be restored, so repeated terminal
  // updates cannot return the same credits twice.
  if (
    updatedTask.status === status &&
    (status === AITaskStatus.FAILED || status === AITaskStatus.CANCELED) &&
    task.taskInfo
  ) {
    try {
      const info = JSON.parse(task.taskInfo as string);
      if (info.creditId) {
        await revoke(info.creditId);
      }
    } catch {
      // Ignore parse errors
    }
  }

  return updatedTask;
}

/** Record the provider id once an asynchronous render has been accepted. */
export async function markTaskProcessing(params: {
  taskId: string;
  providerTaskId: string;
}): Promise<boolean> {
  await db()
    .update(aiTask)
    .set({
      taskId: params.providerTaskId,
      status: AITaskStatus.PROCESSING,
    })
    .where(
      and(eq(aiTask.id, params.taskId), eq(aiTask.status, AITaskStatus.PENDING))
    );

  const task = await findTask(params.taskId);
  return task?.status === AITaskStatus.PROCESSING;
}

function taskSessionId(task: { options?: string | null }): string {
  if (!task.options) return '';
  try {
    const options = JSON.parse(task.options) as { sessionId?: unknown };
    return typeof options.sessionId === 'string' ? options.sessionId : '';
  } catch {
    return '';
  }
}

/** Active provider jobs owned by one chat session. */
export async function getActiveTasksForSession(params: {
  userId: string;
  sessionId: string;
}) {
  const rows = await db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, params.userId),
        or(
          eq(aiTask.status, AITaskStatus.PENDING),
          eq(aiTask.status, AITaskStatus.PROCESSING)
        ),
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(desc(aiTask.createdAt));

  return rows.filter(
    (task: typeof aiTask.$inferSelect) =>
      taskSessionId(task) === params.sessionId
  );
}

/**
 * Get tasks for a user.
 */
export async function getTasks(params: {
  userId: string;
  mediaType?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { userId, mediaType, status, page = 1, limit = 20 } = params;

  return db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, userId),
        mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
        status ? eq(aiTask.status, status) : undefined,
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(desc(aiTask.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
}

/**
 * Find task by ID.
 */
export async function findTask(taskId: string) {
  const [result] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);
  return result;
}

/**
 * Compare-and-swap `taskInfo` while the row is still pending or processing.
 * Returns false when another worker already changed the row.
 */
export async function replaceTaskInfo(params: {
  taskId: string;
  previous: string | null;
  next: string;
  providerTaskId?: string | null;
  status?: AITaskStatus;
}): Promise<boolean> {
  const patch: {
    taskInfo: string;
    taskId?: string | null;
    status?: AITaskStatus;
  } = { taskInfo: params.next };
  if (params.providerTaskId !== undefined) patch.taskId = params.providerTaskId;
  if (params.status) patch.status = params.status;
  const updated = await db()
    .update(aiTask)
    .set(patch)
    .where(
      and(
        eq(aiTask.id, params.taskId),
        inArray(aiTask.status, [AITaskStatus.PENDING, AITaskStatus.PROCESSING]),
        params.previous == null
          ? isNull(aiTask.taskInfo)
          : eq(aiTask.taskInfo, params.previous)
      )
    )
    .returning({ id: aiTask.id });
  if (Array.isArray(updated)) return updated.length > 0;
  const current = await findTask(params.taskId);
  return current?.taskInfo === params.next;
}

/** Owner-scoped standalone Create tasks; no conversation records are required. */
export async function getCreateTasks(
  userId: string,
  options: { limit?: number; cursor?: string; activeOnly?: boolean } = {}
): Promise<AiTask[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const cursorParts = options.cursor?.split(':');
  const cursorTimestamp = cursorParts?.[0] ? Number(cursorParts[0]) : NaN;
  const cursorId = cursorParts?.slice(1).join(':');
  const cursorDate = Number.isFinite(cursorTimestamp)
    ? new Date(cursorTimestamp)
    : undefined;
  return db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, userId),
        eq(aiTask.mediaType, 'video'),
        like(aiTask.options, '%"source":"create"%'),
        options.activeOnly
          ? or(eq(aiTask.status, 'pending'), eq(aiTask.status, 'processing'))
          : undefined,
        cursorDate && cursorId
          ? or(
              lt(aiTask.createdAt, cursorDate),
              and(eq(aiTask.createdAt, cursorDate), lt(aiTask.id, cursorId))
            )
          : undefined,
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(desc(aiTask.createdAt), desc(aiTask.id))
    .limit(limit);
}
