import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/core/db';
import {
  abExperiment,
  abParticipant,
  abVisitor,
  funnelEvent,
  order,
  type ABExperiment,
  type ABParticipant,
  type ABVisitor,
} from '@/config/db/schema';
import {
  abExperimentInput,
  HOME_LOGIN_SCENE,
  type ABAssignment,
  type ABExperimentInput,
  type ABGroupStats,
  type ABVariant,
  type ABVisitorAssignment,
  type ABVisitorEvent,
} from '@/lib/ab-tests';
import { getUuid, md5 } from '@/lib/hash';

export async function createExperiment(input: ABExperimentInput) {
  const parsed = abExperimentInput.parse(input);
  const id = getUuid();
  await db()
    .insert(abExperiment)
    .values({ id, ...parsed, status: 'draft' });
  return { id };
}

export async function transitionExperiment(
  id: string,
  action: 'start' | 'stop'
) {
  const database = db();
  const [experiment]: ABExperiment[] = await database
    .select()
    .from(abExperiment)
    .where(eq(abExperiment.id, id))
    .limit(1);
  if (!experiment) throw new Error('Experiment not found');
  const expected = action === 'start' ? 'draft' : 'running';
  if (experiment.status !== expected)
    throw new Error('Invalid experiment transition');
  // The unique activeScene column arbitrates concurrent starts atomically.
  await database
    .update(abExperiment)
    .set(
      action === 'start'
        ? {
            status: 'running',
            activeScene: experiment.scene,
            startedAt: new Date(),
          }
        : { status: 'stopped', activeScene: null, stoppedAt: new Date() }
    )
    .where(and(eq(abExperiment.id, id), eq(abExperiment.status, expected)));
}

export function variantFor(
  experimentId: string,
  userId: string,
  bPercent: number
): ABVariant {
  const bucket =
    parseInt(md5(`${experimentId}:${userId}`).slice(0, 8), 16) / 0x100000000;
  return bucket < bPercent / 100 ? 'B' : 'A';
}

export async function assignParticipant(
  scene: string,
  userId: string
): Promise<ABAssignment | null> {
  const database = db();
  // Preserve exposed users' UI while a stopped experiment finishes observation,
  // even if another experiment has begun recruiting in the same scene.
  const observing = await database
    .select({ participant: abParticipant, experiment: abExperiment })
    .from(abParticipant)
    .innerJoin(abExperiment, eq(abParticipant.experimentId, abExperiment.id))
    .where(
      and(
        eq(abParticipant.userId, userId),
        eq(abExperiment.scene, scene),
        eq(abExperiment.status, 'stopped'),
        isNotNull(abParticipant.firstExposedAt)
      )
    )
    .orderBy(desc(abExperiment.startedAt));
  const previous = observing.find(
    (row: { participant: ABParticipant; experiment: ABExperiment }) =>
      row.participant.firstExposedAt!.getTime() +
        row.experiment.windowDays * 86400000 >
      Date.now()
  );
  if (previous)
    return {
      participantId: previous.participant.id,
      experimentId: previous.experiment.id,
      scene,
      variant: previous.participant.variant as ABVariant,
    };
  const [experiment]: ABExperiment[] = await database
    .select()
    .from(abExperiment)
    .where(
      and(
        eq(abExperiment.activeScene, scene),
        eq(abExperiment.status, 'running')
      )
    )
    .limit(1);
  if (!experiment) return null;
  const condition = and(
    eq(abParticipant.experimentId, experiment.id),
    eq(abParticipant.userId, userId)
  );
  let [participant]: ABParticipant[] = await database
    .select()
    .from(abParticipant)
    .where(condition)
    .limit(1);
  if (!participant) {
    const row = {
      id: getUuid(),
      experimentId: experiment.id,
      userId,
      variant: variantFor(experiment.id, userId, experiment.bPercent),
    };
    // A no-op conflict update works on both SQLite/Postgres and the MySQL shim.
    await database
      .insert(abParticipant)
      .values(row)
      .onConflictDoUpdate({
        target: [abParticipant.experimentId, abParticipant.userId],
        set: { userId },
      });
    [participant] = await database
      .select()
      .from(abParticipant)
      .where(condition)
      .limit(1);
  }
  return {
    participantId: participant.id,
    experimentId: experiment.id,
    scene,
    variant: participant.variant as ABVariant,
  };
}

export async function recordExposure(participantId: string, userId: string) {
  const database = db();
  const [row] = await database
    .select({ participant: abParticipant, experiment: abExperiment })
    .from(abParticipant)
    .innerJoin(abExperiment, eq(abParticipant.experimentId, abExperiment.id))
    .where(
      and(eq(abParticipant.id, participantId), eq(abParticipant.userId, userId))
    )
    .limit(1);
  if (!row) throw new Error('Invalid participant');
  if (row.participant.firstExposedAt) return;
  if (row.experiment.status !== 'running')
    throw new Error('Invalid participant');
  await database
    .update(abParticipant)
    .set({ firstExposedAt: new Date() })
    .where(
      and(
        eq(abParticipant.id, participantId),
        eq(abParticipant.userId, userId),
        isNull(abParticipant.firstExposedAt)
      )
    );
}

/** Recruit before login; the browser identity comes only from an HttpOnly cookie. */
export async function assignVisitor(
  visitorId: string,
  userId?: string
): Promise<ABVisitorAssignment | null> {
  const database = db();
  const previous = await database
    .select({ visitor: abVisitor, experiment: abExperiment })
    .from(abVisitor)
    .innerJoin(abExperiment, eq(abVisitor.experimentId, abExperiment.id))
    .where(
      and(
        eq(abVisitor.visitorId, visitorId),
        eq(abExperiment.scene, HOME_LOGIN_SCENE)
      )
    )
    .orderBy(desc(abExperiment.startedAt));
  const existing = previous.find(
    ({
      visitor,
      experiment,
    }: {
      visitor: ABVisitor;
      experiment: ABExperiment;
    }) =>
      experiment.status === 'running' ||
      (experiment.status === 'stopped' &&
        visitor.firstExposedAt &&
        visitor.firstExposedAt.getTime() + experiment.windowDays * 86400000 >
          Date.now())
  );
  let visitor: ABVisitor;
  let experiment: ABExperiment;
  if (existing) {
    ({ visitor, experiment } = existing);
    if (userId && visitor.userId && visitor.userId !== userId) return null;
  } else {
    // Already-signed-in visitors are outside this experiment's population.
    if (userId) return null;
    const [active]: ABExperiment[] = await database
      .select()
      .from(abExperiment)
      .where(
        and(
          eq(abExperiment.activeScene, HOME_LOGIN_SCENE),
          eq(abExperiment.status, 'running')
        )
      )
      .limit(1);
    if (!active) return null;
    experiment = active;
    await database
      .insert(abVisitor)
      .values({
        id: getUuid(),
        experimentId: active.id,
        visitorId,
        variant: variantFor(active.id, visitorId, active.bPercent),
      })
      .onConflictDoUpdate({
        target: [abVisitor.experimentId, abVisitor.visitorId],
        set: { visitorId },
      });
    [visitor] = await database
      .select()
      .from(abVisitor)
      .where(
        and(
          eq(abVisitor.experimentId, active.id),
          eq(abVisitor.visitorId, visitorId)
        )
      )
      .limit(1);
  }
  if (userId && visitor.firstExposedAt && !visitor.userId) {
    const now = new Date();
    const insideWindow =
      now.getTime() <
      visitor.firstExposedAt.getTime() + experiment.windowDays * 86400000;
    if (insideWindow) {
      // Keep payment attribution compatible with the existing order FK.
      await database
        .insert(abParticipant)
        .values({
          id: getUuid(),
          experimentId: experiment.id,
          userId,
          variant: visitor.variant,
          firstExposedAt: visitor.firstExposedAt,
        })
        .onConflictDoUpdate({
          target: [abParticipant.experimentId, abParticipant.userId],
          set: { userId },
        });
      const [participant]: ABParticipant[] = await database
        .select()
        .from(abParticipant)
        .where(
          and(
            eq(abParticipant.experimentId, experiment.id),
            eq(abParticipant.userId, userId)
          )
        )
        .limit(1);
      const [linked] = await database
        .select({ id: abVisitor.id })
        .from(abVisitor)
        .where(eq(abVisitor.participantId, participant.id))
        .limit(1);
      const loginFields = {
        userId,
        authenticatedAt: now,
      };
      const owner = and(eq(abVisitor.id, visitor.id), isNull(abVisitor.userId));
      try {
        await database
          .update(abVisitor)
          .set({
            ...loginFields,
            participantId:
              !linked && participant.variant === visitor.variant
                ? participant.id
                : null,
          })
          .where(owner);
      } catch {
        // Concurrent logins in two browsers may race for the unique payment
        // participant. Record login completion without duplicating revenue.
        await database.update(abVisitor).set(loginFields).where(owner);
      }
      [visitor] = await database
        .select()
        .from(abVisitor)
        .where(eq(abVisitor.id, visitor.id))
        .limit(1);
      if (visitor.userId !== userId) return null;
    }
  }
  return {
    participantId: visitor.id,
    experimentId: experiment.id,
    scene: HOME_LOGIN_SCENE,
    variant: visitor.variant as ABVariant,
    checkoutParticipantId:
      visitor.userId === userId ? visitor.participantId : null,
  };
}

export async function recordVisitorEvent(
  visitorId: string,
  id: string,
  event: ABVisitorEvent
) {
  const database = db();
  const [row] = await database
    .select({ visitor: abVisitor, experiment: abExperiment })
    .from(abVisitor)
    .innerJoin(abExperiment, eq(abVisitor.experimentId, abExperiment.id))
    .where(and(eq(abVisitor.id, id), eq(abVisitor.visitorId, visitorId)))
    .limit(1);
  if (!row) throw new Error('Invalid visitor');
  const { visitor, experiment } = row;
  if (event === 'exposure' && experiment.status !== 'running') return;
  if (
    event !== 'exposure' &&
    (!visitor.firstExposedAt ||
      visitor.firstExposedAt.getTime() + experiment.windowDays * 86400000 <=
        Date.now())
  )
    return;
  const field = {
    exposure: 'firstExposedAt',
    photo_selected: 'photoSelectedAt',
    login_prompt: 'loginPromptAt',
    submit: 'submittedAt',
  } as const;
  const key = field[event];
  await database
    .update(abVisitor)
    .set({ [key]: new Date() })
    .where(
      and(
        eq(abVisitor.id, id),
        eq(abVisitor.visitorId, visitorId),
        isNull(abVisitor[key])
      )
    );
}

export async function recordVisitorGeneration(
  visitorId: string,
  userId: string
) {
  const assignment = await assignVisitor(visitorId, userId);
  if (!assignment) return;
  const [row] = await db()
    .select({ visitor: abVisitor, experiment: abExperiment })
    .from(abVisitor)
    .innerJoin(abExperiment, eq(abVisitor.experimentId, abExperiment.id))
    .where(eq(abVisitor.id, assignment.participantId))
    .limit(1);
  if (
    !row?.visitor.firstExposedAt ||
    row.visitor.firstExposedAt.getTime() +
      row.experiment.windowDays * 86400000 <=
      Date.now()
  )
    return;
  await db()
    .update(abVisitor)
    .set({ generatedAt: new Date() })
    .where(
      and(
        eq(abVisitor.id, assignment.participantId),
        eq(abVisitor.userId, userId),
        isNull(abVisitor.generatedAt)
      )
    );
}

export async function getVisitorCheckoutParticipant(
  visitorId: string,
  userId: string,
  scope: 'subscription' | 'topup'
) {
  const assignment = await assignVisitor(visitorId, userId);
  return assignment?.checkoutParticipantId
    ? getCheckoutParticipant(assignment.checkoutParticipantId, userId, scope)
    : null;
}

/** Client context selects an entry point, never a group, price or another user. */
export async function getCheckoutParticipant(
  participantId: string,
  userId: string,
  productScope: 'subscription' | 'topup'
) {
  const [row] = await db()
    .select({ participant: abParticipant, experiment: abExperiment })
    .from(abParticipant)
    .innerJoin(abExperiment, eq(abParticipant.experimentId, abExperiment.id))
    .where(
      and(eq(abParticipant.id, participantId), eq(abParticipant.userId, userId))
    )
    .limit(1);
  if (
    !row ||
    !row.participant.firstExposedAt ||
    (row.experiment.productScope !== 'any' &&
      row.experiment.productScope !== productScope)
  )
    return null;
  const now = Date.now();
  const expires =
    row.participant.firstExposedAt.getTime() +
    row.experiment.windowDays * 86400000;
  // Existing participants can finish purchases after stopping recruitment.
  if (!['running', 'stopped'].includes(row.experiment.status) || now >= expires)
    return null;
  return row.participant.id as string;
}

/** Exposed participant in one scene and variant. Client input cannot choose the group. */
export async function isExposedSceneVariant(
  participantId: unknown,
  userId: string,
  scene: string,
  variant: ABVariant,
  productScope: 'subscription' | 'topup'
) {
  if (
    typeof participantId !== 'string' ||
    !participantId ||
    participantId.length > 64
  )
    return false;
  const id = await getCheckoutParticipant(participantId, userId, productScope);
  if (id !== participantId) return false;
  const [row] = await db()
    .select({
      variant: abParticipant.variant,
      scene: abExperiment.scene,
    })
    .from(abParticipant)
    .innerJoin(abExperiment, eq(abParticipant.experimentId, abExperiment.id))
    .where(eq(abParticipant.id, participantId))
    .limit(1);
  return row?.variant === variant && row.scene === scene;
}

export function summarizeGroups(
  experiment: Pick<ABExperiment, 'windowDays'>,
  participants: ABParticipant[],
  orders: (typeof order.$inferSelect)[],
  now = Date.now()
): ABGroupStats[] {
  return (['A', 'B'] as const).map((variant) => {
    const exposed = participants.filter(
      (p) => p.variant === variant && p.firstExposedAt
    );
    const cohort = new Map(exposed.map((p) => [p.id, p]));
    const mature = new Set(
      exposed
        .filter(
          (p) =>
            p.firstExposedAt!.getTime() + experiment.windowDays * 86400000 <=
            now
        )
        .map((p) => p.id)
    );
    const checkouts = orders.filter((o) => {
      const p = o.abParticipantId ? cohort.get(o.abParticipantId) : undefined;
      return (
        p &&
        !o.isTest &&
        o.createdAt.getTime() >= p.firstExposedAt!.getTime() &&
        o.createdAt.getTime() <
          p.firstExposedAt!.getTime() + experiment.windowDays * 86400000
      );
    });
    const paid = checkouts.filter((o) => {
      if (!o.paymentConfirmedAt || o.paymentConfirmedAt.getTime() > now)
        return false;
      // Provider-verified payment time handles delayed webhook delivery.
      const paidAt = (o.paidAt ?? o.paymentConfirmedAt).getTime();
      const exposedAt = cohort
        .get(o.abParticipantId!)!
        .firstExposedAt!.getTime();
      return (
        paidAt >= exposedAt &&
        paidAt <= now &&
        paidAt < exposedAt + experiment.windowDays * 86400000
      );
    });
    const payers = new Set(paid.map((o) => o.abParticipantId));
    const maturePayers = [...payers].filter((id) => mature.has(id!)).length;
    const money = new Map<string, { amount: number; orders: number }>();
    let missingAmounts = 0;
    for (const o of paid) {
      if (o.paymentAmount == null || !o.paymentCurrency) {
        missingAmounts++;
        continue;
      }
      const currency = o.paymentCurrency.toUpperCase();
      const bucket = money.get(currency) ?? { amount: 0, orders: 0 };
      bucket.amount += o.paymentAmount;
      bucket.orders++;
      money.set(currency, bucket);
    }
    return {
      variant,
      participants: exposed.length,
      matureParticipants: mature.size,
      checkoutUsers: new Set(checkouts.map((o) => o.abParticipantId)).size,
      payers: payers.size,
      paidOrders: paid.length,
      maturePayers,
      conversionRate: exposed.length ? payers.size / exposed.length : 0,
      matureConversionRate: mature.size ? maturePayers / mature.size : null,
      missingAmounts,
      revenue: [...money].map(([currency, v]) => ({
        currency,
        amount: v.amount,
        perUser: exposed.length ? v.amount / exposed.length : 0,
        averageOrder: v.amount / v.orders,
      })),
    };
  });
}

function attachExperimentFunnels(
  experiment: ABExperiment,
  groups: ABGroupStats[],
  participants: ABParticipant[],
  visitors: ABVisitor[]
) {
  const participantByUser = new Map(
    participants.filter((p) => p.firstExposedAt).map((p) => [p.userId, p])
  );
  const visitorByCookie = new Map(
    visitors.filter((v) => v.firstExposedAt).map((v) => [v.visitorId, v])
  );
  const visitorByUser = new Map(
    visitors
      .filter((v) => v.firstExposedAt && v.userId)
      .map((v) => [v.userId!, v])
  );

  const userIds = [...participantByUser.keys(), ...visitorByUser.keys()];
  const visitorIds = [...visitorByCookie.keys()];
  const scopes: SQL[] = [];
  if (userIds.length) scopes.push(inArray(funnelEvent.userId, userIds));
  if (visitorIds.length)
    scopes.push(inArray(funnelEvent.visitorId, visitorIds));
  const loadEvents = async () =>
    scopes.length
      ? db()
          .select()
          .from(funnelEvent)
          .where(
            and(
              or(...scopes),
              inArray(funnelEvent.eventName, [
                'photo_selected',
                'authenticated',
              ])
            )
          )
      : [];

  return loadEvents().then((events) => {
    for (const group of groups) {
      const photoPeople = new Set<string>();
      const authenticatedPeople = new Set<string>();
      for (const event of events) {
        if (
          event.eventName !== 'photo_selected' &&
          event.eventName !== 'authenticated'
        )
          continue;
        const visitor =
          visitorByCookie.get(event.visitorId) ||
          (event.userId ? visitorByUser.get(event.userId) : undefined);
        const participant = event.userId
          ? participantByUser.get(event.userId)
          : undefined;
        const subject = visitor || participant;
        if (!subject || subject.variant !== group.variant) continue;
        const exposedAt = subject.firstExposedAt;
        if (!exposedAt || event.createdAt > exposedAt) continue;
        const assignedAt = experiment.startedAt || subject.assignedAt;
        if (event.createdAt < assignedAt) continue;
        const identity =
          visitor?.userId || visitor?.visitorId || participant?.userId;
        if (!identity) continue;
        if (event.eventName === 'photo_selected') photoPeople.add(identity);
        else authenticatedPeople.add(identity);
      }

      if (experiment.scene === HOME_LOGIN_SCENE) {
        for (const visitor of visitors) {
          if (visitor.variant !== group.variant) continue;
          const identity = visitor.userId || visitor.visitorId;
          if (visitor.photoSelectedAt) photoPeople.add(identity);
          if (visitor.authenticatedAt) authenticatedPeople.add(identity);
        }
      } else {
        for (const participant of participants) {
          if (
            participant.variant === group.variant &&
            participant.firstExposedAt
          )
            authenticatedPeople.add(participant.userId);
        }
      }

      group.funnel = {
        photoSelected: photoPeople.size,
        authenticated: authenticatedPeople.size,
        paywallShown: group.participants,
        checkouts: group.checkoutUsers,
        payers: group.payers,
      };
    }
  });
}

export async function listExperiments() {
  return db().select().from(abExperiment).orderBy(asc(abExperiment.createdAt));
}

export async function getExperimentStats(id: string) {
  const database = db();
  const [experiment]: ABExperiment[] = await database
    .select()
    .from(abExperiment)
    .where(eq(abExperiment.id, id))
    .limit(1);
  if (!experiment) throw new Error('Experiment not found');
  const participants: ABParticipant[] = await database
    .select()
    .from(abParticipant)
    .where(
      and(
        eq(abParticipant.experimentId, id),
        isNotNull(abParticipant.firstExposedAt)
      )
    );
  // Join orders only to unique participants, not to events: no revenue fan-out.
  const orders = await database
    .select({ order })
    .from(order)
    .innerJoin(abParticipant, eq(order.abParticipantId, abParticipant.id))
    .where(eq(abParticipant.experimentId, id));
  const { activeScene: _activeScene, ...publicExperiment } = experiment;
  if (experiment.scene === HOME_LOGIN_SCENE) {
    const visitors: ABVisitor[] = await database
      .select()
      .from(abVisitor)
      .where(
        and(eq(abVisitor.experimentId, id), isNotNull(abVisitor.firstExposedAt))
      );
    // Include anonymous abandonments in denominators, and attach each payment
    // participant to at most one browser to prevent revenue fan-out.
    const cohorts = visitors.map((v) => ({
      ...v,
      id: v.participantId ?? v.id,
      userId: v.userId ?? '',
    }));
    const groups = summarizeGroups(
      experiment,
      cohorts,
      orders.map((r: { order: typeof order.$inferSelect }) => r.order)
    );
    await attachExperimentFunnels(experiment, groups, participants, visitors);
    for (const group of groups) {
      const cohort = visitors.filter((v) => v.variant === group.variant);
      const authenticated = cohort.filter((v) => v.authenticatedAt).length;
      group.visitorFunnel = {
        photoSelected: cohort.filter((v) => v.photoSelectedAt).length,
        loginPrompts: cohort.filter((v) => v.loginPromptAt).length,
        submits: cohort.filter((v) => v.submittedAt).length,
        authenticated,
        generations: cohort.filter((v) => v.generatedAt).length,
        loginConversionRate: cohort.length ? authenticated / cohort.length : 0,
      };
    }
    return { ...publicExperiment, groups };
  }
  const groups = summarizeGroups(
    experiment,
    participants,
    orders.map((r: { order: typeof order.$inferSelect }) => r.order)
  );
  await attachExperimentFunnels(experiment, groups, participants, []);
  return {
    ...publicExperiment,
    groups,
  };
}
