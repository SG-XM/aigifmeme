/**
 * MySQL schema definitions.
 *
 * This is the MySQL dialect of the database schema.
 * To use: set DATABASE_PROVIDER=mysql in .env.local,
 * then copy this file's content into schema.ts.
 */

import {
  boolean,
  index,
  int,
  longtext,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const table = mysqlTable;

const varchar191 = (name: string) => varchar(name, { length: 191 });

// ─── Auth ────────────────────────────────────────────────────────────────────

export const user = table(
  'user',
  {
    id: varchar191('id').primaryKey(),
    name: varchar191('name').notNull(),
    email: varchar191('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    lastVisitAt: timestamp('last_visit_at'),
    utmSource: varchar('utm_source', { length: 100 }).notNull().default(''),
    utmMedium: varchar('utm_medium', { length: 100 }).notNull().default(''),
    utmCampaign: varchar('utm_campaign', { length: 100 }).notNull().default(''),
    utmTerm: varchar('utm_term', { length: 100 }).notNull().default(''),
    utmContent: varchar('utm_content', { length: 100 }).notNull().default(''),
    referrerDomain: varchar('referrer_domain', { length: 253 })
      .notNull()
      .default(''),
    ip: varchar('ip', { length: 45 }).notNull().default(''),
    locale: varchar('locale', { length: 20 }).notNull().default(''),
    countryCode: varchar('country_code', { length: 2 }).notNull().default(''),
  },
  (table) => [
    index('idx_user_name').on(table.name),
    index('idx_user_created_at').on(table.createdAt),
  ]
);

export const session = table(
  'session',
  {
    id: varchar191('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: varchar191('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    userId: varchar191('user_id')
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
    id: varchar191('id').primaryKey(),
    accountId: varchar191('account_id').notNull(),
    providerId: varchar('provider_id', { length: 50 }).notNull(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: varchar('scope', { length: 255 }),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_account_user_id').on(table.userId),
    index('idx_account_provider_account').on(table.providerId, table.accountId),
  ]
);

export const verification = table(
  'verification',
  {
    id: varchar191('id').primaryKey(),
    identifier: varchar191('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)]
);

// ─── Content ─────────────────────────────────────────────────────────────────

export const config = table('config', {
  name: varchar191('name').unique().notNull(),
  value: text('value'),
});

export const taxonomy = table(
  'taxonomy',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: varchar191('parent_id'),
    slug: varchar191('slug').unique().notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    image: text('image'),
    icon: varchar191('icon'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: int('sort').default(0).notNull(),
  },
  (table) => [index('idx_taxonomy_type_status').on(table.type, table.status)]
);

export const post = table(
  'post',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: varchar191('parent_id'),
    slug: varchar191('slug').unique().notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }),
    description: text('description'),
    titleEs: varchar('title_es', { length: 255 }),
    descriptionEs: text('description_es'),
    titleZh: varchar('title_zh', { length: 255 }),
    descriptionZh: text('description_zh'),
    titleAr: varchar('title_ar', { length: 255 }),
    descriptionAr: text('description_ar'),
    image: text('image'),
    content: longtext('content'),
    contentEs: longtext('content_es'),
    contentZh: longtext('content_zh'),
    contentAr: longtext('content_ar'),
    categories: text('categories'),
    tags: text('tags'),
    authorName: varchar191('author_name'),
    authorImage: text('author_image'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    sort: int('sort').default(0).notNull(),
  },
  (table) => [index('idx_post_type_status').on(table.type, table.status)]
);

// ─── Business ────────────────────────────────────────────────────────────────

// A/B tests: one purchase UI experiment per scene, logged-in users only.
export const abExperiment = table('ab_experiment', {
  id: varchar191('id').primaryKey(),
  key: varchar191('key').notNull().unique(),
  name: text('name').notNull(),
  scene: varchar191('scene').notNull(),
  productScope: varchar191('product_scope').notNull(),
  status: varchar191('status').notNull().default('draft'),
  // A running experiment owns this unique slot; drafts/stopped rows use NULL.
  activeScene: varchar191('active_scene').unique(),
  bPercent: int('b_percent').notNull().default(50),
  windowDays: int('window_days').notNull().default(7),
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: timestamp('started_at'),
  stoppedAt: timestamp('stopped_at'),
});

export const abParticipant = table(
  'ab_participant',
  {
    id: varchar191('id').primaryKey(),
    experimentId: varchar191('experiment_id')
      .notNull()
      .references(() => abExperiment.id),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    variant: varchar191('variant').notNull(),
    assignedAt: timestamp('assigned_at')
      .notNull()
      .$defaultFn(() => new Date()),
    firstExposedAt: timestamp('first_exposed_at'),
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
    id: varchar191('id').primaryKey(),
    experimentId: varchar191('experiment_id')
      .notNull()
      .references(() => abExperiment.id),
    visitorId: varchar191('visitor_id').notNull(),
    variant: varchar191('variant').notNull(),
    assignedAt: timestamp('assigned_at')
      .notNull()
      .$defaultFn(() => new Date()),
    firstExposedAt: timestamp('first_exposed_at'),
    photoSelectedAt: timestamp('photo_selected_at'),
    loginPromptAt: timestamp('login_prompt_at'),
    submittedAt: timestamp('submitted_at'),
    authenticatedAt: timestamp('authenticated_at'),
    generatedAt: timestamp('generated_at'),
    userId: varchar191('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    participantId: varchar191('participant_id').references(
      () => abParticipant.id,
      { onDelete: 'set null' }
    ),
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
    id: varchar191('id').primaryKey(),
    visitorId: varchar191('visitor_id').notNull(),
    userId: varchar191('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    eventName: varchar('event_name', { length: 40 }).notNull(),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
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
    id: varchar191('id').primaryKey(),
    orderNo: varchar191('order_no').unique().notNull(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    abParticipantId: varchar191('ab_participant_id').references(
      () => abParticipant.id
    ),
    isTest: boolean('is_test').notNull().default(false),
    paymentConfirmedAt: timestamp('payment_confirmed_at'),
    checkoutSource: varchar191('checkout_source').notNull().default('site'),
    recallId: varchar191('recall_id'),
    userEmail: varchar191('user_email'),
    status: varchar('status', { length: 50 }).notNull(),
    amount: int('amount').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    productId: varchar191('product_id'),
    paymentType: varchar('payment_type', { length: 50 }),
    paymentInterval: varchar('payment_interval', { length: 50 }),
    paymentProvider: varchar('payment_provider', { length: 50 }).notNull(),
    paymentSessionId: varchar191('payment_session_id'),
    checkoutInfo: text('checkout_info').notNull(),
    checkoutResult: text('checkout_result'),
    paymentResult: text('payment_result'),
    discountCode: varchar191('discount_code'),
    discountAmount: int('discount_amount'),
    discountCurrency: varchar('discount_currency', { length: 10 }),
    paymentEmail: varchar191('payment_email'),
    paymentAmount: int('payment_amount'),
    paymentCurrency: varchar('payment_currency', { length: 10 }),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    description: text('description'),
    productName: varchar('product_name', { length: 255 }),
    subscriptionId: varchar191('subscription_id'),
    subscriptionResult: text('subscription_result'),
    checkoutUrl: text('checkout_url'),
    callbackUrl: text('callback_url'),
    creditsAmount: int('credits_amount'),
    creditsValidDays: int('credits_valid_days'),
    planName: varchar191('plan_name'),
    paymentProductId: varchar191('payment_product_id'),
    invoiceId: varchar191('invoice_id'),
    invoiceUrl: text('invoice_url'),
    subscriptionNo: varchar191('subscription_no'),
    transactionId: varchar191('transaction_id'),
    paymentUserName: varchar191('payment_user_name'),
    paymentUserId: varchar191('payment_user_id'),
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
    id: varchar191('id').primaryKey(),
    subscriptionNo: varchar191('subscription_no').unique().notNull(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: varchar191('user_email'),
    status: varchar('status', { length: 50 }).notNull(),
    paymentProvider: varchar('payment_provider', { length: 50 }).notNull(),
    subscriptionId: varchar191('subscription_id').notNull(),
    subscriptionResult: text('subscription_result'),
    productId: varchar191('product_id'),
    description: text('description'),
    amount: int('amount'),
    currency: varchar('currency', { length: 10 }),
    interval: varchar('interval', { length: 50 }),
    intervalCount: int('interval_count'),
    trialPeriodDays: int('trial_period_days'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    planName: varchar191('plan_name'),
    billingUrl: text('billing_url'),
    productName: varchar('product_name', { length: 255 }),
    creditsAmount: int('credits_amount'),
    creditsValidDays: int('credits_valid_days'),
    paymentProductId: varchar191('payment_product_id'),
    paymentUserId: varchar191('payment_user_id'),
    canceledAt: timestamp('canceled_at'),
    canceledEndAt: timestamp('canceled_end_at'),
    canceledReason: text('canceled_reason'),
    canceledReasonType: varchar('canceled_reason_type', { length: 50 }),
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
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: varchar191('user_email'),
    orderNo: varchar191('order_no'),
    subscriptionNo: varchar191('subscription_no'),
    transactionNo: varchar191('transaction_no').unique().notNull(),
    transactionType: varchar('transaction_type', { length: 50 }).notNull(),
    transactionScene: varchar('transaction_scene', { length: 50 }),
    credits: int('credits').notNull(),
    remainingCredits: int('remaining_credits').notNull().default(0),
    description: text('description'),
    expiresAt: timestamp('expires_at'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
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
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    keyHash: varchar191('key_hash').notNull(),
    keyPrefix: varchar191('key_prefix').notNull(),
    key: varchar191('key'),
    title: varchar191('title').notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
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
    id: varchar191('id').primaryKey(),
    name: varchar191('name').notNull().unique(),
    title: varchar191('title').notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    sort: int('sort').default(0).notNull(),
  },
  (table) => [index('idx_role_status').on(table.status)]
);

export const permission = table(
  'permission',
  {
    id: varchar191('id').primaryKey(),
    code: varchar191('code').notNull().unique(),
    resource: varchar('resource', { length: 50 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    title: varchar191('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_permission_resource_action').on(table.resource, table.action),
  ]
);

export const rolePermission = table(
  'role_permission',
  {
    id: varchar191('id').primaryKey(),
    roleId: varchar191('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: varchar191('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
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
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: varchar191('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [
    index('idx_user_role_user_expires').on(table.userId, table.expiresAt),
  ]
);

// ─── AI ──────────────────────────────────────────────────────────────────────

export const aiTask = table(
  'ai_task',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mediaType: varchar('media_type', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar191('model').notNull(),
    prompt: longtext('prompt').notNull(),
    options: longtext('options'),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    taskId: varchar191('task_id'),
    taskInfo: longtext('task_info'),
    taskResult: longtext('task_result'),
    costCredits: int('cost_credits').notNull().default(0),
    scene: varchar('scene', { length: 100 }).notNull().default(''),
    creditId: varchar191('credit_id'),
  },
  (table) => [
    index('idx_ai_task_user_media_type').on(table.userId, table.mediaType),
    index('idx_ai_task_media_type_status').on(table.mediaType, table.status),
  ]
);

export const chat = table(
  'chat',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).notNull(),
    // Share-link visibility: 'private' (owner only) | 'public' (anyone
    // with the link).
    visibility: varchar('visibility', { length: 20 })
      .notNull()
      .default('private'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    model: varchar191('model').notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull().default(''),
    parts: longtext('parts').notNull(),
    metadata: longtext('metadata'),
    content: longtext('content'),
  },
  (table) => [index('idx_chat_user_status').on(table.userId, table.status)]
);

export const chatMessage = table(
  'chat_message',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: varchar191('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    parts: longtext('parts').notNull(),
    metadata: longtext('metadata'),
    model: varchar191('model').notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
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
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id),
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('open'), // open | replied | closed
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index('idx_ticket_user').on(t.userId),
    index('idx_ticket_status').on(t.status),
  ]
);

export const ticketMessage = table(
  'ticket_message',
  {
    id: varchar191('id').primaryKey(),
    ticketId: varchar191('ticket_id')
      .notNull()
      .references(() => ticket.id),
    userId: varchar191('user_id')
      .notNull()
      .references(() => user.id),
    role: varchar('role', { length: 50 }).notNull().default('user'), // user | admin
    content: longtext('content').notNull(),
    attachments: longtext('attachments').notNull(), // JSON array of image URLs (default [] set by service)
    createdAt: timestamp('created_at').defaultNow().notNull(),
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
    productId: varchar191('product_id').primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description').notNull().default(''),
    nameEs: varchar('name_es', { length: 150 }).notNull().default(''),
    descriptionEs: text('description_es').notNull().default(''),
    priceInCents: int('price_in_cents').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    credits: int('credits').notNull(),
    creditsValidDays: int('credits_valid_days').notNull().default(365),
    enabled: boolean('enabled').notNull().default(true),
    sort: int('sort').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index('idx_credit_topup_enabled_sort').on(t.enabled, t.sort)]
);

export type CreditTopUpProduct = typeof creditTopUpProduct.$inferSelect;
export type NewCreditTopUpProduct = typeof creditTopUpProduct.$inferInsert;

export const creditRedeemCode = table(
  'credit_redeem_code',
  {
    id: varchar191('id').primaryKey(),
    code: varchar('code', { length: 80 }).notNull().unique(),
    credits: int('credits').notNull(),
    note: text('note').notNull().default(''),
    expiresAt: timestamp('expires_at').notNull(),
    createdBy: varchar191('created_by').references(() => user.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    sentToEmail: varchar('sent_to_email', { length: 320 }),
    sentAt: timestamp('sent_at'),
    sendReservedAt: timestamp('send_reserved_at'),
    sendReservationId: varchar191('send_reservation_id'),
    invalidatedAt: timestamp('invalidated_at'),
    redeemedAt: timestamp('redeemed_at'),
    redeemedEmail: varchar('redeemed_email', { length: 320 }),
    redeemedUserId: varchar191('redeemed_user_id').references(() => user.id),
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

export const subscriptionPlan = table(
  'subscription_plan',
  {
    productId: varchar191('product_id').primaryKey(),
    nameEn: varchar('name_en', { length: 150 }).notNull(),
    nameZh: varchar('name_zh', { length: 150 }).notNull(),
    nameEs: varchar('name_es', { length: 150 }).notNull().default(''),
    descriptionEn: text('description_en').notNull(),
    descriptionZh: text('description_zh').notNull(),
    descriptionEs: text('description_es').notNull().default(''),
    featuresEn: text('features_en').notNull(),
    featuresZh: text('features_zh').notNull(),
    featuresEs: text('features_es').notNull().default(''),
    badgeEn: varchar('badge_en', { length: 80 }).notNull().default(''),
    badgeZh: varchar('badge_zh', { length: 80 }).notNull().default(''),
    badgeEs: varchar('badge_es', { length: 80 }).notNull().default(''),
    priceInCents: int('price_in_cents').notNull(),
    compareAtPriceInCents: int('compare_at_price_in_cents'),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    interval: varchar('interval', { length: 20 }).notNull(),
    intervalCount: int('interval_count').notNull().default(1),
    credits: int('credits').notNull(),
    creditsValidDays: int('credits_valid_days').notNull(),
    featured: boolean('featured').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    sort: int('sort').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index('idx_subscription_plan_enabled_sort').on(t.enabled, t.sort)]
);

// One durable recall slot per account and normalized email, across both segments.
export const emailRecall = table(
  'email_recall',
  {
    id: varchar191('id').primaryKey(),
    userId: varchar191('user_id')
      .unique()
      .references(() => user.id, { onDelete: 'set null' }),
    emailKey: varchar191('email_key').notNull().unique(),
    recipientEmail: varchar191('recipient_email').notNull(),
    locale: varchar191('locale').notNull(),
    kind: varchar191('kind').notNull(),
    productId: varchar191('product_id').notNull(),
    paymentProvider: varchar191('payment_provider'),
    originalOrderNo: varchar191('original_order_no'),
    triggeredAt: timestamp('triggered_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    status: varchar191('status').notNull().default('ready'),
    claimToken: varchar191('claim_token'),
    attemptedAt: timestamp('attempted_at'),
    sentAt: timestamp('sent_at'),
    resendId: varchar191('resend_id'),
    lastError: text('last_error'),
    unsubscribedAt: timestamp('unsubscribed_at'),
    clickedAt: timestamp('clicked_at'),
    checkoutGeneration: int('checkout_generation').notNull().default(0),
    checkoutLockToken: varchar191('checkout_lock_token'),
    checkoutLockedAt: timestamp('checkout_locked_at'),
    checkoutUrl: text('checkout_url'),
    lastCheckoutAt: timestamp('last_checkout_at'),
  },
  (t) => [
    index('idx_email_recall_status_created').on(t.status, t.createdAt),
    index('idx_email_recall_resend').on(t.resendId),
  ]
);
export type EmailRecall = typeof emailRecall.$inferSelect;

export const emailRecallSuppression = table('email_recall_suppression', {
  emailKey: varchar191('email_key').primaryKey(),
  reason: varchar191('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Unused leftover from the removed Demo videos admin (`0014_home_demo_video.sql`).
// Homepage clips live in `src/lib/home-demos.ts`. The table stays so existing
// databases are not dropped. Nothing reads or writes it.
export const homeDemoVideo = table(
  'home_demo_video',
  {
    id: varchar191('id').primaryKey(),
    slot: varchar('slot', { length: 16 }).notNull(),
    src: text('src').notNull(),
    poster: text('poster'),
    title: text('title').notNull(),
    titleZh: text('title_zh'),
    titleAr: text('title_ar'),
    titleEs: text('title_es'),
    sort: int('sort').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index('idx_home_demo_video_slot_sort').on(t.slot, t.enabled, t.sort)]
);

export type HomeDemoVideo = typeof homeDemoVideo.$inferSelect;
export type NewHomeDemoVideo = typeof homeDemoVideo.$inferInsert;
