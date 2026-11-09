/**
 * SQLite schema definitions.
 *
 * This is the SQLite dialect of the database schema.
 * To use: set DATABASE_PROVIDER=sqlite in .env.local
 */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const table = sqliteTable;

const sqliteNowMs = sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`;

// ─── Auth ────────────────────────────────────────────────────────────────────

export const user = table(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' })
      .default(false)
      .notNull(),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    lastVisitAt: integer('last_visit_at', { mode: 'timestamp_ms' }),
    utmSource: text('utm_source').notNull().default(''),
    utmMedium: text('utm_medium').notNull().default(''),
    utmCampaign: text('utm_campaign').notNull().default(''),
    utmTerm: text('utm_term').notNull().default(''),
    utmContent: text('utm_content').notNull().default(''),
    referrerDomain: text('referrer_domain').notNull().default(''),
    ip: text('ip').notNull().default(''),
    locale: text('locale').notNull().default(''),
    countryCode: text('country_code').notNull().default(''),
  },
  (table) => [
    index('idx_user_name').on(table.name),
    index('idx_user_created_at').on(table.createdAt),
  ]
);

export const session = table(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('idx_session_user_expires').on(table.userId, table.expiresAt),
  ]
);

export const account = table(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_account_user_id').on(table.userId),
    index('idx_account_provider_account').on(table.providerId, table.accountId),
  ]
);

export const verification = table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)]
);

// ─── Content ─────────────────────────────────────────────────────────────────

export const config = table('config', {
  name: text('name').unique().notNull(),
  value: text('value'),
});

export const taxonomy = table(
  'taxonomy',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    slug: text('slug').unique().notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    image: text('image'),
    icon: text('icon'),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [index('idx_taxonomy_type_status').on(table.type, table.status)]
);

export const post = table(
  'post',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    slug: text('slug').unique().notNull(),
    type: text('type').notNull(),
    title: text('title'),
    description: text('description'),
    titleEs: text('title_es'),
    descriptionEs: text('description_es'),
    titleZh: text('title_zh'),
    descriptionZh: text('description_zh'),
    titleAr: text('title_ar'),
    descriptionAr: text('description_ar'),
    image: text('image'),
    content: text('content'),
    contentEs: text('content_es'),
    contentZh: text('content_zh'),
    contentAr: text('content_ar'),
    categories: text('categories'),
    tags: text('tags'),
    authorName: text('author_name'),
    authorImage: text('author_image'),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [index('idx_post_type_status').on(table.type, table.status)]
);

// ─── Business ────────────────────────────────────────────────────────────────

// A/B tests: one purchase UI experiment per scene, logged-in users only.
export const abExperiment = table('ab_experiment', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  scene: text('scene').notNull(),
  productScope: text('product_scope').notNull(),
  status: text('status').notNull().default('draft'),
  // A running experiment owns this unique slot; drafts/stopped rows use NULL.
  activeScene: text('active_scene').unique(),
  bPercent: integer('b_percent').notNull().default(50),
  windowDays: integer('window_days').notNull().default(7),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  stoppedAt: integer('stopped_at', { mode: 'timestamp_ms' }),
});

export const abParticipant = table(
  'ab_participant',
  {
    id: text('id').primaryKey(),
    experimentId: text('experiment_id')
      .notNull()
      .references(() => abExperiment.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    variant: text('variant').notNull(),
    assignedAt: integer('assigned_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    firstExposedAt: integer('first_exposed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('idx_ab_participant_experiment_user').on(
      t.experimentId,
      t.userId
    ),
    index('idx_ab_participant_experiment_variant').on(
      t.experimentId,
      t.variant
    ),
  ]
);

// Anonymous visitors are separate from authenticated payment participants.
// Adding this table leaves existing participants and order foreign keys intact.
export const abVisitor = table(
  'ab_visitor',
  {
    id: text('id').primaryKey(),
    experimentId: text('experiment_id')
      .notNull()
      .references(() => abExperiment.id),
    visitorId: text('visitor_id').notNull(),
    variant: text('variant').notNull(),
    assignedAt: integer('assigned_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    firstExposedAt: integer('first_exposed_at', { mode: 'timestamp_ms' }),
    photoSelectedAt: integer('photo_selected_at', { mode: 'timestamp_ms' }),
    loginPromptAt: integer('login_prompt_at', { mode: 'timestamp_ms' }),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    authenticatedAt: integer('authenticated_at', { mode: 'timestamp_ms' }),
    generatedAt: integer('generated_at', { mode: 'timestamp_ms' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    participantId: text('participant_id').references(() => abParticipant.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('idx_ab_visitor_experiment_cookie').on(
      t.experimentId,
      t.visitorId
    ),
    uniqueIndex('idx_ab_visitor_participant').on(t.participantId),
  ]
);
export type ABVisitor = typeof abVisitor.$inferSelect;

export const funnelEvent = table(
  'funnel_event',
  {
    id: text('id').primaryKey(),
    visitorId: text('visitor_id').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    eventName: text('event_name').notNull(),
    metadata: text('metadata'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
  },
  (t) => [
    index('idx_funnel_event_created').on(t.createdAt),
    index('idx_funnel_event_visitor_event').on(t.visitorId, t.eventName),
    index('idx_funnel_event_user_event').on(t.userId, t.eventName),
  ]
);
export type FunnelEvent = typeof funnelEvent.$inferSelect;
export type NewFunnelEvent = typeof funnelEvent.$inferInsert;

export type ABExperiment = typeof abExperiment.$inferSelect;
export type ABParticipant = typeof abParticipant.$inferSelect;

export const order = table(
  'order',
  {
    id: text('id').primaryKey(),
    orderNo: text('order_no').unique().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    abParticipantId: text('ab_participant_id').references(
      () => abParticipant.id
    ),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    paymentConfirmedAt: integer('payment_confirmed_at', {
      mode: 'timestamp_ms',
    }),
    checkoutSource: text('checkout_source').notNull().default('site'),
    recallId: text('recall_id'),
    userEmail: text('user_email'),
    status: text('status').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    productId: text('product_id'),
    paymentType: text('payment_type'),
    paymentInterval: text('payment_interval'),
    paymentProvider: text('payment_provider').notNull(),
    paymentSessionId: text('payment_session_id'),
    checkoutInfo: text('checkout_info').notNull(),
    checkoutResult: text('checkout_result'),
    paymentResult: text('payment_result'),
    discountCode: text('discount_code'),
    discountAmount: integer('discount_amount'),
    discountCurrency: text('discount_currency'),
    paymentEmail: text('payment_email'),
    paymentAmount: integer('payment_amount'),
    paymentCurrency: text('payment_currency'),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    description: text('description'),
    productName: text('product_name'),
    subscriptionId: text('subscription_id'),
    subscriptionResult: text('subscription_result'),
    checkoutUrl: text('checkout_url'),
    callbackUrl: text('callback_url'),
    creditsAmount: integer('credits_amount'),
    creditsValidDays: integer('credits_valid_days'),
    planName: text('plan_name'),
    paymentProductId: text('payment_product_id'),
    invoiceId: text('invoice_id'),
    invoiceUrl: text('invoice_url'),
    subscriptionNo: text('subscription_no'),
    transactionId: text('transaction_id'),
    paymentUserName: text('payment_user_name'),
    paymentUserId: text('payment_user_id'),
  },
  (table) => [
    index('idx_order_user_status_payment_type').on(
      table.userId,
      table.status,
      table.paymentType
    ),
    index('idx_order_transaction_provider').on(
      table.transactionId,
      table.paymentProvider
    ),
    index('idx_order_ab_participant').on(table.abParticipantId),
    index('idx_order_created_at').on(table.createdAt),
  ]
);

export const subscription = table(
  'subscription',
  {
    id: text('id').primaryKey(),
    subscriptionNo: text('subscription_no').unique().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    status: text('status').notNull(),
    paymentProvider: text('payment_provider').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    subscriptionResult: text('subscription_result'),
    productId: text('product_id'),
    description: text('description'),
    amount: integer('amount'),
    currency: text('currency'),
    interval: text('interval'),
    intervalCount: integer('interval_count'),
    trialPeriodDays: integer('trial_period_days'),
    currentPeriodStart: integer('current_period_start', {
      mode: 'timestamp_ms',
    }),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    planName: text('plan_name'),
    billingUrl: text('billing_url'),
    productName: text('product_name'),
    creditsAmount: integer('credits_amount'),
    creditsValidDays: integer('credits_valid_days'),
    paymentProductId: text('payment_product_id'),
    paymentUserId: text('payment_user_id'),
    canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
    canceledEndAt: integer('canceled_end_at', { mode: 'timestamp_ms' }),
    canceledReason: text('canceled_reason'),
    canceledReasonType: text('canceled_reason_type'),
  },
  (table) => [
    index('idx_subscription_user_status_interval').on(
      table.userId,
      table.status,
      table.interval
    ),
    index('idx_subscription_provider_id').on(
      table.subscriptionId,
      table.paymentProvider
    ),
    index('idx_subscription_created_at').on(table.createdAt),
  ]
);

export const credit = table(
  'credit',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email'),
    orderNo: text('order_no'),
    subscriptionNo: text('subscription_no'),
    transactionNo: text('transaction_no').unique().notNull(),
    transactionType: text('transaction_type').notNull(),
    transactionScene: text('transaction_scene'),
    credits: integer('credits').notNull(),
    remainingCredits: integer('remaining_credits').notNull().default(0),
    description: text('description'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    consumedDetail: text('consumed_detail'),
    metadata: text('metadata'),
  },
  (table) => [
    index('idx_credit_consume_fifo').on(
      table.userId,
      table.status,
      table.transactionType,
      table.remainingCredits,
      table.expiresAt
    ),
    index('idx_credit_order_no').on(table.orderNo),
    index('idx_credit_subscription_no').on(table.subscriptionNo),
  ]
);

export const apikey = table(
  'apikey',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    key: text('key'),
    title: text('title').notNull(),
    status: text('status').notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_apikey_user_status').on(table.userId, table.status),
    index('idx_apikey_keyhash_status').on(table.keyHash, table.status),
  ]
);

// ─── RBAC ────────────────────────────────────────────────────────────────────

export const role = table(
  'role',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    sort: integer('sort').default(0).notNull(),
  },
  (table) => [index('idx_role_status').on(table.status)]
);

export const permission = table(
  'permission',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_permission_resource_action').on(table.resource, table.action),
  ]
);

export const rolePermission = table(
  'role_permission',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_role_permission_role_permission').on(
      table.roleId,
      table.permissionId
    ),
  ]
);

export const userRole = table(
  'user_role',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_user_role_user_expires').on(table.userId, table.expiresAt),
  ]
);

// ─── AI ──────────────────────────────────────────────────────────────────────

export const aiTask = table(
  'ai_task',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    options: text('options'),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    taskId: text('task_id'),
    taskInfo: text('task_info'),
    taskResult: text('task_result'),
    costCredits: integer('cost_credits').notNull().default(0),
    scene: text('scene').notNull().default(''),
    creditId: text('credit_id'),
  },
  (table) => [
    index('idx_ai_task_user_media_type').on(table.userId, table.mediaType),
    index('idx_ai_task_media_type_status').on(table.mediaType, table.status),
  ]
);

export const chat = table(
  'chat',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    // Share-link visibility: 'private' (owner only) | 'public' (anyone
    // with the link).
    visibility: text('visibility').notNull().default('private'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    title: text('title').notNull().default(''),
    parts: text('parts').notNull(),
    metadata: text('metadata'),
    content: text('content'),
  },
  (table) => [index('idx_chat_user_status').on(table.userId, table.status)]
);

export const chatMessage = table(
  'chat_message',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
    role: text('role').notNull(),
    parts: text('parts').notNull(),
    metadata: text('metadata'),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
  },
  (table) => [
    index('idx_chat_message_chat_id').on(table.chatId, table.status),
    index('idx_chat_message_user_id').on(table.userId, table.status),
  ]
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type Config = typeof config.$inferSelect;
export type Taxonomy = typeof taxonomy.$inferSelect;
export type NewTaxonomy = typeof taxonomy.$inferInsert;
export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;
export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type Subscription = typeof subscription.$inferSelect;
export type NewSubscription = typeof subscription.$inferInsert;
export type Credit = typeof credit.$inferSelect;
export type NewCredit = typeof credit.$inferInsert;
export type Apikey = typeof apikey.$inferSelect;
export type NewApikey = typeof apikey.$inferInsert;
export type Role = typeof role.$inferSelect;
export type NewRole = typeof role.$inferInsert;
export type Permission = typeof permission.$inferSelect;
export type RolePermission = typeof rolePermission.$inferSelect;
export type UserRole = typeof userRole.$inferSelect;
export type AiTask = typeof aiTask.$inferSelect;
export type NewAiTask = typeof aiTask.$inferInsert;
export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;
export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;

// ─── Tickets (support) ───────────────────────────────────────────────────────

export const ticket = table(
  'ticket',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    title: text('title').notNull(),
    status: text('status').notNull().default('open'), // open | replied | closed
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('idx_ticket_user').on(t.userId),
    index('idx_ticket_status').on(t.status),
  ]
);

export const ticketMessage = table(
  'ticket_message',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => ticket.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    role: text('role').notNull().default('user'), // user | admin
    content: text('content').notNull(),
    attachments: text('attachments').notNull().default('[]'), // JSON array of image URLs
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('idx_ticket_message_ticket').on(t.ticketId)]
);

export type Ticket = typeof ticket.$inferSelect;
export type NewTicket = typeof ticket.$inferInsert;
export type TicketMessage = typeof ticketMessage.$inferSelect;
export type NewTicketMessage = typeof ticketMessage.$inferInsert;

// ─── Custom tables ───────────────────────────────────────────────────────────
// Add your own tables below this line.

export const creditTopUpProduct = table(
  'credit_top_up_product',
  {
    productId: text('product_id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    nameEs: text('name_es').notNull().default(''),
    descriptionEs: text('description_es').notNull().default(''),
    priceInCents: integer('price_in_cents').notNull(),
    currency: text('currency').notNull().default('usd'),
    credits: integer('credits').notNull(),
    creditsValidDays: integer('credits_valid_days').notNull().default(365),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('idx_credit_topup_enabled_sort').on(t.enabled, t.sort)]
);

export type CreditTopUpProduct = typeof creditTopUpProduct.$inferSelect;
export type NewCreditTopUpProduct = typeof creditTopUpProduct.$inferInsert;

export const subscriptionPlan = table(
  'subscription_plan',
  {
    productId: text('product_id').primaryKey(),
    nameEn: text('name_en').notNull(),
    nameZh: text('name_zh').notNull(),
    nameEs: text('name_es').notNull().default(''),
    descriptionEn: text('description_en').notNull().default(''),
    descriptionZh: text('description_zh').notNull().default(''),
    descriptionEs: text('description_es').notNull().default(''),
    featuresEn: text('features_en').notNull().default(''),
    featuresZh: text('features_zh').notNull().default(''),
    featuresEs: text('features_es').notNull().default(''),
    badgeEn: text('badge_en').notNull().default(''),
    badgeZh: text('badge_zh').notNull().default(''),
    badgeEs: text('badge_es').notNull().default(''),
    priceInCents: integer('price_in_cents').notNull(),
    compareAtPriceInCents: integer('compare_at_price_in_cents'),
    currency: text('currency').notNull().default('usd'),
    interval: text('interval').notNull(),
    intervalCount: integer('interval_count').notNull().default(1),
    credits: integer('credits').notNull(),
    creditsValidDays: integer('credits_valid_days').notNull(),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('idx_subscription_plan_enabled_sort').on(t.enabled, t.sort)]
);

export type SubscriptionPlan = typeof subscriptionPlan.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlan.$inferInsert;

// ─── Invite Codes ────────────────────────────────────────────────────────────

export const inviteCode = table(
  'invite_code',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    trialDays: integer('trial_days').notNull().default(15),
    note: text('note').default(''),
    createdBy: text('created_by').references(() => user.id),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('idx_invite_code_code').on(t.code)]
);

export const userInvite = table(
  'user_invite',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    inviteCodeId: text('invite_code_id')
      .notNull()
      .references(() => inviteCode.id),
    activatedAt: integer('activated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    trialEndsAt: integer('trial_ends_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('idx_user_invite_user').on(t.userId),
    index('idx_user_invite_code').on(t.inviteCodeId),
  ]
);

export type InviteCode = typeof inviteCode.$inferSelect;
export type NewInviteCode = typeof inviteCode.$inferInsert;
export type UserInvite = typeof userInvite.$inferSelect;
export type NewUserInvite = typeof userInvite.$inferInsert;

export const creditRedeemCode = table(
  'credit_redeem_code',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    credits: integer('credits').notNull(),
    note: text('note').notNull().default(''),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').references(() => user.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    sentToEmail: text('sent_to_email'),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    sendReservedAt: integer('send_reserved_at', { mode: 'timestamp_ms' }),
    sendReservationId: text('send_reservation_id'),
    invalidatedAt: integer('invalidated_at', { mode: 'timestamp_ms' }),
    redeemedAt: integer('redeemed_at', { mode: 'timestamp_ms' }),
    redeemedEmail: text('redeemed_email'),
    redeemedUserId: text('redeemed_user_id').references(() => user.id),
  },
  (t) => [
    index('idx_credit_redeem_status').on(
      t.invalidatedAt,
      t.redeemedAt,
      t.expiresAt
    ),
    index('idx_credit_redeem_sent').on(t.sentAt, t.sentToEmail),
  ]
);

export type CreditRedeemCode = typeof creditRedeemCode.$inferSelect;
export type NewCreditRedeemCode = typeof creditRedeemCode.$inferInsert;

// One durable recall slot per account and normalized email, across both segments.
export const emailRecall = table(
  'email_recall',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .unique()
      .references(() => user.id, { onDelete: 'set null' }),
    emailKey: text('email_key').notNull().unique(),
    recipientEmail: text('recipient_email').notNull(),
    locale: text('locale').notNull(),
    kind: text('kind').notNull(),
    productId: text('product_id').notNull(),
    paymentProvider: text('payment_provider'),
    originalOrderNo: text('original_order_no'),
    triggeredAt: integer('triggered_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status').notNull().default('ready'),
    claimToken: text('claim_token'),
    attemptedAt: integer('attempted_at', { mode: 'timestamp_ms' }),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    resendId: text('resend_id'),
    lastError: text('last_error'),
    unsubscribedAt: integer('unsubscribed_at', { mode: 'timestamp_ms' }),
    clickedAt: integer('clicked_at', { mode: 'timestamp_ms' }),
    checkoutGeneration: integer('checkout_generation').notNull().default(0),
    checkoutLockToken: text('checkout_lock_token'),
    checkoutLockedAt: integer('checkout_locked_at', { mode: 'timestamp_ms' }),
    checkoutUrl: text('checkout_url'),
    lastCheckoutAt: integer('last_checkout_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('idx_email_recall_status_created').on(t.status, t.createdAt),
    index('idx_email_recall_resend').on(t.resendId),
  ]
);
export type EmailRecall = typeof emailRecall.$inferSelect;

export const emailRecallSuppression = table('email_recall_suppression', {
  emailKey: text('email_key').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sqliteNowMs)
    .notNull(),
});

// Unused leftover from the removed Demo videos admin (`0014_home_demo_video.sql`).
// Homepage clips live in `src/lib/home-demos.ts`. The table stays so existing
// databases are not dropped. Nothing reads or writes it.
export const homeDemoVideo = table(
  'home_demo_video',
  {
    id: text('id').primaryKey(),
    slot: text('slot').notNull(),
    src: text('src').notNull(),
    poster: text('poster'),
    title: text('title').notNull(),
    titleZh: text('title_zh'),
    titleAr: text('title_ar'),
    titleEs: text('title_es'),
    sort: integer('sort').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('idx_home_demo_video_slot_sort').on(t.slot, t.enabled, t.sort)]
);

export type HomeDemoVideo = typeof homeDemoVideo.$inferSelect;
export type NewHomeDemoVideo = typeof homeDemoVideo.$inferInsert;

export const gifPackTheme = table(
  'gif_pack_theme',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    version: integer('version').notNull(),
    nameEn: text('name_en').notNull(),
    nameZh: text('name_zh').notNull(),
    backgroundColor: text('background_color').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
  },
  (t) => [uniqueIndex('gif_pack_theme_slug_version').on(t.slug, t.version)]
);

export const gifPackMotion = table(
  'gif_pack_motion',
  {
    id: text('id').primaryKey(),
    themeId: text('theme_id').notNull(),
    position: integer('position').notNull(),
    intent: text('intent').notNull(),
    captionEn: text('caption_en').notNull(),
    captionZh: text('caption_zh').notNull(),
  },
  (t) => [uniqueIndex('gif_pack_motion_theme_pos').on(t.themeId, t.position)]
);

export const gifPack = table(
  'gif_pack',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    dayKey: text('day_key').notNull(),
    themeId: text('theme_id').notNull(),
    themeVersion: integer('theme_version').notNull(),
    style: text('style').notNull(),
    motionMode: text('motion_mode').notNull(),
    background: text('background').notNull(),
    language: text('language').notNull(),
    status: text('status').notNull(),
    phase: text('phase').notNull(),
    userRegens: integer('user_regens').notNull().default(0),
    anchorAttempts: integer('anchor_attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    lockToken: text('lock_token'),
    heartbeatAt: integer('heartbeat_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('gif_pack_user_idempotency').on(t.userId, t.idempotencyKey),
    uniqueIndex('gif_pack_user_day').on(t.userId, t.dayKey),
    index('gif_pack_status_heartbeat').on(t.status, t.heartbeatAt),
  ]
);

export const gifPackSticker = table(
  'gif_pack_sticker',
  {
    id: text('id').primaryKey(),
    packId: text('pack_id').notNull(),
    position: integer('position').notNull(),
    intent: text('intent').notNull(),
    caption: text('caption').notNull(),
    status: text('status').notNull(),
    systemAttempts: integer('system_attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
  },
  (t) => [uniqueIndex('gif_pack_sticker_pack_pos').on(t.packId, t.position)]
);

export const gifPackFile = table(
  'gif_pack_file',
  {
    id: text('id').primaryKey(),
    packId: text('pack_id').notNull(),
    stickerId: text('sticker_id'),
    kind: text('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull().default(0),
    frameCount: integer('frame_count'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sqliteNowMs)
      .notNull(),
  },
  (t) => [index('gif_pack_file_pack').on(t.packId, t.kind)]
);

export const gifPackUpload = table('gif_pack_upload', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  originalKey: text('original_key').notNull(),
  cropKey: text('crop_key').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  packId: text('pack_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sqliteNowMs)
    .notNull(),
});

export const gifPackBlob = table('gif_pack_blob', {
  storageKey: text('storage_key').primaryKey(),
  contentType: text('content_type').notNull(),
  bytes: text('bytes').notNull(),
});

export const gifPackDemo = table(
  'gif_pack_demo',
  {
    id: text('id').primaryKey(),
    referenceId: text('reference_id').notNull(),
    themeSlug: text('theme_slug').notNull(),
    title: text('title').notNull(),
    assetStatus: text('asset_status').notNull(),
    note: text('note').notNull(),
  },
  (t) => [uniqueIndex('gif_pack_demo_ref_theme').on(t.referenceId, t.themeSlug)]
);
