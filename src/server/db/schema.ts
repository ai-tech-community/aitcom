import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type {
  OccurrenceStatus,
  RitualMode,
  RitualStatus,
} from "../communities/rituals";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// All Drizzle-managed tables live in the "app" schema to avoid conflicts
// with Payload CMS tables which live in "public".
export const appSchema = pgSchema("app");

// Posts example table
export const posts = appSchema.table(
  "post",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 256 }),
    createdById: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("created_by_idx").on(t.createdById),
    index("name_idx").on(t.name),
  ],
);

// Better Auth core tables
export const user = appSchema.table("user", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.varchar({ length: 255 }),
  email: d.varchar({ length: 255 }).notNull().unique(),
  emailVerified: d.boolean().default(false),
  image: d.varchar({ length: 255 }),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
}));

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
}));

export const account = appSchema.table(
  "account",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    accountId: d.varchar({ length: 255 }).notNull(),
    providerId: d.varchar({ length: 255 }).notNull(),
    accessToken: d.text(),
    refreshToken: d.text(),
    accessTokenExpiresAt: d.timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: d.timestamp({ withTimezone: true }),
    scope: d.varchar({ length: 255 }),
    idToken: d.text(),
    password: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const session = appSchema.table(
  "session",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    token: d.varchar({ length: 255 }).notNull().unique(),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    ipAddress: d.varchar({ length: 255 }),
    userAgent: d.varchar({ length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const verification = appSchema.table(
  "verification",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifier: d.varchar({ length: 255 }).notNull(),
    value: d.varchar({ length: 255 }).notNull(),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Event registrations (member-facing, managed by Drizzle)
// Using varchar instead of pgEnum to avoid conflicts with Payload CMS enums in public schema.
export const eventRegistrations = appSchema.table(
  "event_registration",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: d.integer().notNull(), // References Payload events table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("registered")
      .$type<
        | "registered"
        | "waitlisted"
        | "cancelled"
        | "attended"
        | "pending_payment"
        | "payment_failed"
        | "intent"
      >(),
    paymentId: d.varchar({ length: 255 }),
    paymentStatus: d.varchar({ length: 50 }),
    registeredAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("registration_event_idx").on(t.eventId),
    index("registration_user_idx").on(t.userId),
  ],
);

export const eventRegistrationRelations = relations(
  eventRegistrations,
  ({ one }) => ({
    user: one(user, {
      fields: [eventRegistrations.userId],
      references: [user.id],
    }),
  }),
);

// Member profiles (1:1 with user)
export const memberProfiles = appSchema.table(
  "member_profile",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => user.id),
    displayName: d.varchar({ length: 255 }).notNull(),
    bio: d.text(),
    skills: d.json().$type<string[]>().default([]).notNull(),
    company: d.varchar({ length: 255 }),
    linkedinUrl: d.varchar({ length: 255 }),
    githubUrl: d.varchar({ length: 255 }),
    websiteUrl: d.varchar({ length: 255 }),
    isPublic: d.boolean().default(true).notNull(),
    xp: d.integer().default(0).notNull(),
    level: d.integer().default(1).notNull(),
    onboardingIntent: d.varchar({ length: 50 }),
    interests: d.json().$type<string[]>().default([]),
    experienceLevel: d.varchar({ length: 30 }),
    onboardingCompleted: d.boolean().default(false).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index("member_profile_xp_idx").on(t.xp)],
);

export const memberProfileRelations = relations(memberProfiles, ({ one }) => ({
  user: one(user, {
    fields: [memberProfiles.userId],
    references: [user.id],
  }),
}));

// Member badges (join table)
export const memberBadges = appSchema.table(
  "member_badge",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    badgeSlug: d.varchar({ length: 100 }).notNull(),
    earnedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("member_badge_user_slug_uidx").on(t.userId, t.badgeSlug),
    index("member_badge_user_idx").on(t.userId),
    index("member_badge_slug_idx").on(t.badgeSlug),
  ],
);

export const memberBadgeRelations = relations(memberBadges, ({ one }) => ({
  user: one(user, {
    fields: [memberBadges.userId],
    references: [user.id],
  }),
}));

// Onboarding steps (per-user step completion tracking)
export const onboardingSteps = appSchema.table(
  "onboarding_step",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    stepSlug: d.varchar({ length: 100 }).notNull(),
    completedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("onboarding_step_user_slug_uidx").on(t.userId, t.stepSlug),
    index("onboarding_step_user_idx").on(t.userId),
  ],
);

export const onboardingStepRelations = relations(
  onboardingSteps,
  ({ one }) => ({
    user: one(user, {
      fields: [onboardingSteps.userId],
      references: [user.id],
    }),
  }),
);

// Agent profiles (1:1 with user, for AI agent identities)
export const agentProfiles = appSchema.table("agent_profile", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerId: d
    .varchar({ length: 255 })
    .unique()
    .references(() => user.id),
  name: d.varchar({ length: 100 }).notNull(),
  avatar: d.varchar({ length: 500 }),
  bio: d.text(),
  expertiseTags: d.json().$type<string[]>().default([]),
  description: d.text(),
  visibilityMode: d.varchar({ length: 20 }).notNull().default("visible"),
  status: d.varchar({ length: 20 }).notNull().default("active"),
  totalContributions: d.integer().notNull().default(0),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  lastActiveAt: d.timestamp({ withTimezone: true }),
  canReadOwnerDMs: d.boolean().default(true).notNull(),
  replyCooldownMinutes: d.integer().notNull().default(30),
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  // Self-registration fields
  claimToken: d.varchar({ length: 64 }).unique(),
  claimTokenExpiresAt: d.timestamp({ withTimezone: true }),
  registrationMethod: d.varchar({ length: 20 }).notNull().default("owner"),
  isVerified: d.boolean().notNull().default(false),
  // Verification fields
  verificationCode: d.varchar({ length: 64 }),
  xHandle: d.varchar({ length: 100 }),
  verifiedAt: d.timestamp({ withTimezone: true }),
}));

export const agentProfilesRelations = relations(agentProfiles, ({ one }) => ({
  owner: one(user, {
    fields: [agentProfiles.ownerId],
    references: [user.id],
  }),
}));

// Agent API keys (for authenticating agent API requests)
export const agentApiKeys = appSchema.table("agent_api_key", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: d.varchar({ length: 255 }).references(() => user.id),
  keyHash: d.varchar({ length: 128 }).notNull(),
  keyPrefix: d.varchar({ length: 20 }).notNull(),
  scopes: d
    .json()
    .$type<string[]>()
    .notNull()
    .default(["read", "contribute", "self-profile"]),
  isActive: d.boolean().notNull().default(true),
  lastUsedAt: d.timestamp({ withTimezone: true }),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

export const agentApiKeysRelations = relations(agentApiKeys, ({ one }) => ({
  agent: one(agentProfiles, {
    fields: [agentApiKeys.agentId],
    references: [agentProfiles.id],
  }),
  owner: one(user, {
    fields: [agentApiKeys.ownerId],
    references: [user.id],
  }),
}));

// Records which manifest version an owner accepted on behalf of their agent
// (ADR-0017). Lookup keys on (ownerId, manifestVersion); a version bump makes
// the current-version lookup miss until the owner re-accepts.
export const agentManifestAcceptances = appSchema.table(
  "agent_manifest_acceptance",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    agentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    manifestVersion: d.integer().notNull(),
    acceptedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("agent_manifest_acceptance_owner_version_uidx").on(
      t.ownerId,
      t.manifestVersion,
    ),
  ],
);

// Agent invite codes (for secure agent self-registration)
export const agentInviteCodes = appSchema.table("agent_invite_code", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: d.varchar({ length: 20 }).notNull().unique(),
  createdBy: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  usedByAgentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
  expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

export const agentInviteCodesRelations = relations(
  agentInviteCodes,
  ({ one }) => ({
    creator: one(user, {
      fields: [agentInviteCodes.createdBy],
      references: [user.id],
    }),
    agent: one(agentProfiles, {
      fields: [agentInviteCodes.usedByAgentId],
      references: [agentProfiles.id],
    }),
  }),
);

// System notifications (platform-generated alerts, separate from agent inbox)
export const notifications = appSchema.table(
  "notification",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    type: d.varchar({ length: 50 }).notNull(), // "challenge_advisory" | "stale_review_reminder" | "challenge_digest" | "broadcast" | "event_reminder" | "introduction_request" | "referral_credited"
    title: d.varchar({ length: 255 }).notNull(),
    content: d.text().notNull(),
    metadata: d.json().$type<Record<string, unknown>>().default({}).notNull(),
    readAt: d.timestamp({ withTimezone: true }),
    communityId: d.varchar("community_id", { length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [index("notification_user_created_idx").on(t.userId, t.createdAt)],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, {
    fields: [notifications.userId],
    references: [user.id],
  }),
}));

// --- Slice B: Notifications infra (digest prefs, broadcasts, ceiling ledger) ---

/** Sparse opt-OUT rows. Absence = opted in. communityId null = global digest
 *  opt-out. category: "digest" | "broadcast". (ADR-0014 preference center.) */
export const notificationOptouts = appSchema.table(
  "notification_optout",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    communityId: d.varchar("community_id", { length: 255 }),
    category: d
      .varchar({ length: 20 })
      .notNull()
      .$type<"digest" | "broadcast">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("notification_optout_user_idx").on(t.userId),
    uniqueIndex("notification_optout_global_uidx")
      .on(t.userId, t.category)
      .where(sql`${t.communityId} IS NULL`),
    uniqueIndex("notification_optout_scoped_uidx")
      .on(t.userId, t.communityId, t.category)
      .where(sql`${t.communityId} IS NOT NULL`),
  ],
);

/** A community-admin broadcast. class "promotional" is ceiling-limited;
 *  "transactional" is system-reserved (event reminders) and exempt. */
export const broadcasts = appSchema.table(
  "broadcast",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar("community_id", { length: 255 })
      .notNull()
      .references(() => communities.id),
    authorId: d
      .varchar("author_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    subject: d.varchar({ length: 255 }).notNull(),
    body: d.text().notNull(),
    class: d
      .varchar({ length: 20 })
      .notNull()
      .default("promotional")
      .$type<"promotional" | "transactional">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sentAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [index("broadcast_community_idx").on(t.communityId)],
);

/** Per-recipient delivery ledger. Ceiling source of truth (count promotional
 *  emailSent rows per (userId, windowKey)) AND dedupe for transactional event
 *  reminders (dedupeKey = "event:<eventId>", broadcastId null). */
export const broadcastDeliveries = appSchema.table(
  "broadcast_delivery",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    broadcastId: d
      .varchar("broadcast_id", { length: 255 })
      .references(() => broadcasts.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    communityId: d.varchar("community_id", { length: 255 }),
    class: d
      .varchar({ length: 20 })
      .notNull()
      .$type<"promotional" | "transactional">(),
    emailSent: d.boolean("email_sent").notNull().default(false),
    windowKey: d.varchar("window_key", { length: 16 }).notNull(),
    dedupeKey: d.varchar("dedupe_key", { length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("broadcast_delivery_user_window_idx").on(t.userId, t.windowKey),
    uniqueIndex("broadcast_delivery_dedupe_uidx")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
  ],
);

/** Weekly digest idempotency: one row per (userId, periodKey). */
export const digestSendLog = appSchema.table(
  "digest_send_log",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    periodKey: d.varchar("period_key", { length: 16 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("digest_send_log_user_period_uidx").on(t.userId, t.periodKey),
  ],
);

// Agent webhooks (per-agent webhook configuration for event delivery)
export const agentWebhooks = appSchema.table("agent_webhook", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  url: d.text().notNull(),
  secret: d.varchar({ length: 128 }).notNull(),
  categories: d.json().$type<string[]>().notNull().default([]),
  cursor: d.timestamp({ withTimezone: true }),
  consecutiveFailures: d.integer().notNull().default(0),
  consecutiveAgentEvents: d.integer().notNull().default(0),
  isEnabled: d.boolean().notNull().default(true),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
}));

export const agentWebhooksRelations = relations(agentWebhooks, ({ one }) => ({
  agent: one(agentProfiles, {
    fields: [agentWebhooks.agentId],
    references: [agentProfiles.id],
  }),
  owner: one(user, {
    fields: [agentWebhooks.ownerId],
    references: [user.id],
  }),
}));

// Agent session logs (rolling memory for cross-run context)
export const agentSessionLogs = appSchema.table(
  "agent_session_log",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => agentProfiles.id),
    summary: d.text().notNull(),
    mode: d.varchar({ length: 20 }).notNull().default("heartbeat"),
    actionsCount: d.integer().notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("agent_session_logs_agent_created_idx").on(t.agentId, t.createdAt),
  ],
);

export const agentSessionLogsRelations = relations(
  agentSessionLogs,
  ({ one }) => ({
    agent: one(agentProfiles, {
      fields: [agentSessionLogs.agentId],
      references: [agentProfiles.id],
    }),
  }),
);

// Agent drafts (content drafts created by agents, pending human review)
export const agentDrafts = appSchema.table("agent_draft", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  type: d.varchar({ length: 50 }).notNull(),
  targetType: d.varchar({ length: 50 }),
  targetId: d.varchar({ length: 255 }),
  content: d.text().notNull(),
  metadata: d.json().$type<Record<string, unknown>>(),
  status: d.varchar({ length: 20 }).notNull().default("pending"),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

// Agent suggestions (suggestions made by agents)
export const agentSuggestions = appSchema.table("agent_suggestion", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  type: d.varchar({ length: 50 }).notNull(),
  title: d.varchar({ length: 500 }),
  content: d.text(),
  metadata: d.json().$type<Record<string, unknown>>(),
  status: d.varchar({ length: 20 }).notNull().default("pending"),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

export const rituals = appSchema.table(
  "ritual",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    authorUserId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    suggestedByAgentId: d
      .varchar({ length: 255 })
      .references(() => agentProfiles.id),
    title: d.varchar({ length: 255 }).notNull(),
    body: d.text().notNull(),
    category: d.varchar({ length: 20 }).notNull().default("general"),
    weekday: d.integer().notNull(),
    mode: d
      .varchar({ length: 10 })
      .$type<RitualMode>()
      .notNull()
      .default("review"),
    status: d
      .varchar({ length: 10 })
      .$type<RitualStatus>()
      .notNull()
      .default("active"),
    lastFiredOn: d.date(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("ritual_community_idx").on(t.communityId),
    index("ritual_status_weekday_idx").on(t.status, t.weekday),
  ],
);

export const ritualOccurrences = appSchema.table(
  "ritual_occurrence",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ritualId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => rituals.id),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    scheduledFor: d.date().notNull(),
    status: d
      .varchar({ length: 10 })
      .$type<OccurrenceStatus>()
      .notNull()
      .default("pending"),
    // Unenforced reference to public.forum_threads(id) (Payload-owned table; no cross-schema FK).
    threadId: d.integer(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    postedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    uniqueIndex("ritual_occurrence_ritual_date_uidx").on(
      t.ritualId,
      t.scheduledFor,
    ),
    index("ritual_occurrence_community_status_idx").on(t.communityId, t.status),
    index("ritual_occurrence_status_posted_idx").on(t.status, t.postedAt),
  ],
);

export const communityEngageConfig = appSchema.table(
  "community_engage_config",
  (d) => ({
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => communities.id),
    ritualRecap: d.boolean().notNull().default(true),
    ritualReminder: d.boolean().notNull().default(true),
    atRiskLine: d.boolean().notNull().default(false),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);

export const communityActivationConfig = appSchema.table(
  "community_activation_config",
  (d) => ({
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => communities.id),
    requireResponse: d.boolean().notNull().default(true),
    requireProfileComplete: d.boolean().notNull().default(false),
    windowDays: d.integer().notNull().default(7),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);

export const communityAcquireConfig = appSchema.table(
  "community_acquire_config",
  (d) => ({
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => communities.id),
    crossPromote: d.boolean().notNull().default(true),
    referralsEnabled: d.boolean().notNull().default(true),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);

export const referralCredits = appSchema.table(
  "referral_credit",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    referrerId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    referredUserId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    xpAwarded: d.integer().notNull(),
    creditedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("referral_credit_referred_uidx").on(t.referredUserId),
    index("referral_credit_referrer_idx").on(t.referrerId),
  ],
);

export const communityOnboardingStep = appSchema.table(
  "community_onboarding_step",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    title: d.varchar({ length: 255 }).notNull(),
    href: d.varchar({ length: 500 }).notNull(),
    position: d.integer().notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("community_onboarding_step_community_pos_idx").on(
      t.communityId,
      t.position,
    ),
  ],
);

export const communityOnboardingProgress = appSchema.table(
  "community_onboarding_progress",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    stepId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communityOnboardingStep.id),
    completedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("community_onboarding_progress_uidx").on(
      t.communityId,
      t.userId,
      t.stepId,
    ),
    index("community_onboarding_progress_member_idx").on(
      t.communityId,
      t.userId,
    ),
  ],
);

/** A double-opt-in introduction between two members, suggested by an agent and
 *  approved by the community organizer. pairKey (= sorted user ids) + a partial
 *  unique index prevents a second OPEN intro for the same pair. responseA/
 *  responseB drive the consent state machine (see agents/advisory.ts). */
export const introductions = appSchema.table(
  "introduction",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar("community_id", { length: 255 })
      .notNull()
      .references(() => communities.id),
    suggestedByAgentId: d
      .varchar("suggested_by_agent_id", { length: 255 })
      .references(() => agentProfiles.id),
    organizerId: d
      .varchar("organizer_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    userIdA: d
      .varchar("user_id_a", { length: 255 })
      .notNull()
      .references(() => user.id),
    userIdB: d
      .varchar("user_id_b", { length: 255 })
      .notNull()
      .references(() => user.id),
    pairKey: d.varchar("pair_key", { length: 600 }).notNull(),
    sharedInterests: d
      .json("shared_interests")
      .$type<string[]>()
      .notNull()
      .default([]),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("pending_consent")
      .$type<"pending_consent" | "connected" | "declined">(),
    responseA: d
      .varchar("response_a", { length: 10 })
      .notNull()
      .default("pending")
      .$type<"pending" | "accepted" | "declined">(),
    responseB: d
      .varchar("response_b", { length: 10 })
      .notNull()
      .default("pending")
      .$type<"pending" | "accepted" | "declined">(),
    conversationId: d
      .varchar("conversation_id", { length: 255 })
      .references(() => conversations.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("introduction_user_a_idx").on(t.userIdA),
    index("introduction_user_b_idx").on(t.userIdB),
    index("introduction_community_idx").on(t.communityId),
    uniqueIndex("introduction_open_pair_uidx")
      .on(t.communityId, t.pairKey)
      .where(sql`${t.status} = 'pending_consent'`),
  ],
);

// Activity events (audit log for all actor actions)
export const activityEvents = appSchema.table(
  "activity_event",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: d.varchar({ length: 255 }).notNull(),
    actorType: d.varchar({ length: 20 }).notNull(),
    action: d.varchar({ length: 50 }).notNull(),
    targetType: d.varchar({ length: 50 }),
    targetId: d.varchar({ length: 255 }),
    metadata: d.json().$type<Record<string, unknown>>(),
    collabSessionId: d.varchar("collab_session_id", { length: 255 }),
    contextType: d.varchar("context_type", { length: 30 }),
    recipientId: d.varchar("recipient_id", { length: 255 }),
    communityId: d.varchar("community_id", { length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("activity_events_actor_idx").on(t.actorId),
    index("activity_events_action_idx").on(t.action),
    index("activity_events_created_idx").on(t.createdAt),
    index("activity_events_session_idx").on(t.collabSessionId),
    index("activity_events_recipient_idx").on(t.recipientId),
    index("activity_events_community_action_created_idx").on(
      t.communityId,
      t.action,
      t.createdAt,
    ),
    index("activity_events_community_recipient_idx").on(
      t.communityId,
      t.recipientId,
    ),
  ],
);

/**
 * Append-only log of XP awards (one row per awardXp), for a member's points
 * history + XP-over-time chart. `totalAfter` is the member's XP total right
 * after this award, so the chart needs no running sum.
 */
export const pointsEvents = appSchema.table(
  "points_event",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d.varchar("user_id", { length: 255 }).notNull(),
    amount: d.integer().notNull(),
    reason: d.varchar({ length: 50 }).notNull(),
    totalAfter: d.integer("total_after"),
    metadata: d.json().$type<Record<string, unknown>>(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("points_event_user_idx").on(t.userId),
    index("points_event_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// Aggregate tables for impact analytics
export const dailyCoreMetrics = appSchema.table("daily_core_metrics", (d) => ({
  date: d.date().notNull().primaryKey(),
  totalContributions: d.integer().notNull().default(0),
  aiAssisted: d.integer().notNull().default(0),
  humanReviewed: d.integer().notNull().default(0),
  collaborationRate: d
    .numeric({ precision: 5, scale: 1 })
    .notNull()
    .default("0"),
  forumHelpfulness: d
    .numeric({ precision: 5, scale: 1 })
    .notNull()
    .default("0"),
  medianResponseMinutes: d.integer(),
  challengeParticipation: d.integer().notNull().default(0),
  challengeCompletion: d.integer().notNull().default(0),
  eventParticipation: d.integer().notNull().default(0),
  growth4w: d.numeric({ precision: 6, scale: 1 }).notNull().default("0"),
  computedAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

export const dailyExperimentalMetrics = appSchema.table(
  "daily_experimental_metrics",
  (d) => ({
    date: d.date().notNull().primaryKey(),
    personalityDistribution: d
      .json()
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    overrideRate: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
    creativityIndex: d
      .numeric({ precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    collaborationDepth: d
      .numeric({ precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    ideaToImplMedianMinutes: d.integer(),
    topPairings: d
      .json()
      .$type<Array<{ pair: [string, string]; count: number }>>()
      .notNull()
      .default([]),
    reuseRatio: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
    learningLoopSignal: d
      .varchar("learning_loop_signal", { length: 20 })
      .$type<"improving" | "stable" | "declining">()
      .notNull()
      .default("stable"),
    learningLoopData: d
      .json()
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    computedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);

export const dailyCollabMix = appSchema.table("daily_collab_mix", (d) => ({
  date: d.date().notNull().primaryKey(),
  aiOnly: d.integer().notNull().default(0),
  humanOnly: d.integer().notNull().default(0),
  collaborative: d.integer().notNull().default(0),
  computedAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

// Challenge enrollments (member joins a challenge)
export const challengeEnrollments = appSchema.table(
  "challenge_enrollment",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    progressLogThreadId: d.varchar({ length: 255 }), // FK → challengeThreads.id (set after creation)
    teamId: d.varchar({ length: 255 }).references(() => teams.id), // nullable: set when the enrollment joins a team (ADR-0029)
    // "Looking for a team" opt-in (#164): set while a SOLO enrollment wants to
    // appear on the teammate-matching list (doubles as its sort order); cleared
    // when the enrollment joins a team. Reads additionally gate on the 'live'
    // phase, so a stale flag after roster lock is harmless.
    lookingForTeamAt: d.timestamp({ withTimezone: true }),
    enrolledAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    completedAt: d.timestamp({ withTimezone: true }),
    submittedAt: d.timestamp({ withTimezone: true }), // When solution submitted for review
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("active")
      .$type<"active" | "completed" | "abandoned" | "submitted">(),
  }),
  (t) => [
    index("enrollment_challenge_idx").on(t.challengeId),
    index("enrollment_user_idx").on(t.userId),
    uniqueIndex("enrollment_user_challenge_uidx").on(t.userId, t.challengeId),
    index("enrollment_team_idx").on(t.teamId),
  ],
);

export const challengeEnrollmentRelations = relations(
  challengeEnrollments,
  ({ one, many }) => ({
    user: one(user, {
      fields: [challengeEnrollments.userId],
      references: [user.id],
    }),
    // Inverse of teams.members (ADR-0029): the team this enrollment belongs to.
    team: one(teams, {
      fields: [challengeEnrollments.teamId],
      references: [teams.id],
    }),
    progress: many(challengeProgress),
    testResults: many(challengeTestResults),
  }),
);

// Challenge progress (per-objective tracking within an enrollment)
export const challengeProgress = appSchema.table(
  "challenge_progress",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    enrollmentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeEnrollments.id),
    objectiveIndex: d.integer().notNull(),
    currentCount: d.integer().notNull().default(0),
    verificationMode: d
      .varchar({ length: 20 })
      .notNull()
      .default("self-report")
      .$type<"platform-action" | "test" | "self-report" | "peer-review">(),
    reviewedBy: d.varchar({ length: 255 }), // userId of reviewer (for peer-review)
    reviewedAt: d.timestamp({ withTimezone: true }),
    completedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("progress_enrollment_idx").on(t.enrollmentId),
    uniqueIndex("progress_enrollment_objective_uidx").on(
      t.enrollmentId,
      t.objectiveIndex,
    ),
  ],
);

export const challengeProgressRelations = relations(
  challengeProgress,
  ({ one }) => ({
    enrollment: one(challengeEnrollments, {
      fields: [challengeProgress.enrollmentId],
      references: [challengeEnrollments.id],
    }),
  }),
);

// Challenge test results (test run history per enrollment)
export const challengeTestResults = appSchema.table(
  "challenge_test_result",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    enrollmentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeEnrollments.id),
    objectiveIndex: d.integer().notNull(),
    passed: d.boolean().notNull(),
    details: d.text(), // Test output summary
    reportedBy: d
      .varchar({ length: 10 })
      .notNull()
      .default("agent")
      .$type<"agent" | "ci">(),
    reportedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("test_result_enrollment_idx").on(t.enrollmentId),
    index("test_result_enrollment_objective_idx").on(
      t.enrollmentId,
      t.objectiveIndex,
    ),
  ],
);

export const challengeTestResultRelations = relations(
  challengeTestResults,
  ({ one }) => ({
    enrollment: one(challengeEnrollments, {
      fields: [challengeTestResults.enrollmentId],
      references: [challengeEnrollments.id],
    }),
  }),
);

// Challenge channels (dedicated forum per challenge)
export const challengeChannels = appSchema.table(
  "challenge_channel",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull().unique(), // One channel per challenge
    communityId: d.varchar("community_id", { length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [uniqueIndex("channel_challenge_uidx").on(t.challengeId)],
);

export const challengeChannelRelations = relations(
  challengeChannels,
  ({ many }) => ({
    threads: many(challengeThreads),
  }),
);

// Challenge threads (threads within a channel)
export const challengeThreads = appSchema.table(
  "challenge_thread",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    channelId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeChannels.id),
    type: d
      .varchar({ length: 20 })
      .notNull()
      .$type<
        "announcement" | "discussion" | "question" | "progress-log" | "solution"
      >(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    authorType: d
      .varchar({ length: 10 })
      .notNull()
      .default("member")
      .$type<"member" | "agent" | "sponsor">(),
    title: d.varchar({ length: 500 }).notNull(),
    content: d.text().notNull(),
    isPinned: d.boolean().notNull().default(false),
    metadata: d.json().$type<Record<string, unknown>>(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("thread_channel_idx").on(t.channelId),
    index("thread_type_idx").on(t.type),
    index("thread_author_idx").on(t.authorId),
  ],
);

export const challengeThreadRelations = relations(
  challengeThreads,
  ({ one, many }) => ({
    channel: one(challengeChannels, {
      fields: [challengeThreads.channelId],
      references: [challengeChannels.id],
    }),
    author: one(user, {
      fields: [challengeThreads.authorId],
      references: [user.id],
    }),
    replies: many(challengeReplies),
  }),
);

// Challenge replies (replies within a thread)
export const challengeReplies = appSchema.table(
  "challenge_reply",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => challengeThreads.id),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    authorType: d
      .varchar({ length: 10 })
      .notNull()
      .default("member")
      .$type<"member" | "agent" | "sponsor">(),
    content: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("reply_thread_idx").on(t.threadId),
    index("reply_author_idx").on(t.authorId),
  ],
);

export const challengeReplyRelations = relations(
  challengeReplies,
  ({ one }) => ({
    thread: one(challengeThreads, {
      fields: [challengeReplies.threadId],
      references: [challengeThreads.id],
    }),
    author: one(user, {
      fields: [challengeReplies.authorId],
      references: [user.id],
    }),
  }),
);

// Agent commissions (standing, scoped, revocable grant authorising an owner's
// own agent to accept commissioned work — ADR-0022)
export const agentCommissions = appSchema.table(
  "agent_commission",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    agentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => agentProfiles.id),
    taskTypeAllowlist: d.json().$type<string[]>().notNull().default([]),
    sourceScope: d
      .varchar({ length: 40 })
      .notNull()
      .default("enrolled-challenges"),
    revokedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("agent_commission_owner_idx").on(t.ownerId),
    index("agent_commission_agent_idx").on(t.agentId),
    uniqueIndex("agent_commission_owner_agent_uidx").on(t.ownerId, t.agentId),
  ],
);

export const agentCommissionsRelations = relations(
  agentCommissions,
  ({ one }) => ({
    owner: one(user, {
      fields: [agentCommissions.ownerId],
      references: [user.id],
    }),
    agent: one(agentProfiles, {
      fields: [agentCommissions.agentId],
      references: [agentProfiles.id],
    }),
  }),
);

// Teams (a grouping over enrollments that enters a hackathon as one unit — ADR-0029)
export const teams = appSchema.table(
  "team",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    eventId: d.integer().notNull(), // The bound hackathon event (denormalised for db-only join/leave)
    name: d.varchar({ length: 100 }).notNull(),
    captainId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    joinCode: d.varchar({ length: 20 }).notNull(),
    maxSize: d.integer().notNull().default(5),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("forming")
      .$type<"forming" | "locked" | "disbanded">(),
    // Plan 2 (judging): the captain's submission freeze + the sponsor's finalize.
    submittedAt: d.timestamp({ withTimezone: true }),
    artifactUrl: d.varchar({ length: 2048 }),
    artifactSummary: d.text(),
    score: d.integer(),
    finalRank: d.integer(),
    prizeAwardedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("team_challenge_idx").on(t.challengeId),
    index("team_captain_idx").on(t.captainId),
    uniqueIndex("team_join_code_uidx").on(t.joinCode),
  ],
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  captain: one(user, {
    fields: [teams.captainId],
    references: [user.id],
  }),
  members: many(challengeEnrollments),
}));

// Per-hackathon staff grants: organizer (delegated event management) or judge
// (rank submitted teams). Keyed on challengeId (the hackathon discriminator),
// like teams/enrollments. Soft-revoked via revokedAt.
export const hackathonStaff = appSchema.table(
  "hackathon_staff",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    role: d.varchar({ length: 20 }).notNull().$type<"organizer" | "judge">(),
    grantedBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    grantedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    revokedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("hackathon_staff_challenge_idx").on(t.challengeId),
    index("hackathon_staff_user_idx").on(t.userId),
    uniqueIndex("hackathon_staff_challenge_user_role_uidx").on(
      t.challengeId,
      t.userId,
      t.role,
    ),
  ],
);

export const hackathonStaffRelations = relations(hackathonStaff, ({ one }) => ({
  user: one(user, {
    fields: [hackathonStaff.userId],
    references: [user.id],
  }),
}));

// Pending email invites for hackathon staff (organizer | judge). A row exists
// only until the invited email signs up (redeemedAt) or an organizer cancels it
// (revokedAt). communityId + challengeTitle are snapshotted at invite time so the
// signup-hook redemption path needs no Payload call.
export const hackathonStaffInvite = appSchema.table(
  "hackathon_staff_invite",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(),
    communityId: d.varchar({ length: 255 }), // null = hub-wide hackathon
    challengeTitle: d.varchar({ length: 255 }).notNull(),
    email: d.varchar({ length: 255 }).notNull(), // normalized (lowercased/trimmed)
    role: d.varchar({ length: 20 }).notNull().$type<"organizer" | "judge">(),
    code: d.varchar({ length: 255 }).notNull(),
    invitedBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    expiresAt: d.timestamp({ withTimezone: true }),
    redeemedAt: d.timestamp({ withTimezone: true }),
    redeemedUserId: d.varchar({ length: 255 }).references(() => user.id),
    revokedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("hackathon_staff_invite_challenge_idx").on(t.challengeId),
    index("hackathon_staff_invite_email_idx").on(t.email),
    uniqueIndex("hackathon_staff_invite_code_uidx").on(t.code),
    // One live invite per (challenge, email, role); cancelled/redeemed rows don't count.
    uniqueIndex("hackathon_staff_invite_live_uidx")
      .on(t.challengeId, t.email, t.role)
      .where(sql`${t.revokedAt} is null and ${t.redeemedAt} is null`),
  ],
);

// A judge's verdict on one team: ordinal rank (1 = best) + optional comment.
// One row per (challenge, judge, team).
export const judgeRankings = appSchema.table(
  "judge_ranking",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(),
    judgeUserId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    rank: d.integer().notNull(),
    comment: d.text(),
    submittedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("judge_ranking_challenge_idx").on(t.challengeId),
    index("judge_ranking_team_idx").on(t.teamId),
    uniqueIndex("judge_ranking_challenge_judge_team_uidx").on(
      t.challengeId,
      t.judgeUserId,
      t.teamId,
    ),
  ],
);

export const judgeRankingsRelations = relations(judgeRankings, ({ one }) => ({
  team: one(teams, {
    fields: [judgeRankings.teamId],
    references: [teams.id],
  }),
}));

// Append-only activity log for a team workspace (Plan 4). One row per workspace
// action; powers the feed. The actor is a user (actorUserId) OR an agent
// (actorAgentId) — agent actions show in the feed even though agents are not
// shown as "present".
export const teamActivityEvents = appSchema.table(
  "team_activity_event",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    cellId: d.varchar({ length: 255 }).references(() => workCells.id),
    actorUserId: d.varchar({ length: 255 }).references(() => user.id),
    actorAgentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    type: d
      .varchar({ length: 20 })
      .notNull()
      .$type<"assigned" | "claimed" | "reported" | "verified" | "failed">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("team_activity_team_idx").on(t.teamId),
    index("team_activity_created_idx").on(t.createdAt),
  ],
);

// Per-member presence heartbeat for a team workspace (Plan 4). One row per
// (team, user); upserted by the heartbeat mutation. "Online" is derived at read
// time from lastSeenAt (no stored online flag).
export const teamPresence = appSchema.table(
  "team_presence",
  (d) => ({
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    lastSeenAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index("team_presence_team_idx").on(t.teamId),
  ],
);

export const teamActivityEventsRelations = relations(
  teamActivityEvents,
  ({ one }) => ({
    team: one(teams, {
      fields: [teamActivityEvents.teamId],
      references: [teams.id],
    }),
    cell: one(workCells, {
      fields: [teamActivityEvents.cellId],
      references: [workCells.id],
    }),
  }),
);

export const teamPresenceRelations = relations(teamPresence, ({ one }) => ({
  team: one(teams, {
    fields: [teamPresence.teamId],
    references: [teams.id],
  }),
  user: one(user, {
    fields: [teamPresence.userId],
    references: [user.id],
  }),
}));

// Work grids (decompose one problem into independent claimable cells — ADR-0023)
export const workGrids = appSchema.table(
  "work_grid",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer(), // nullable: non-challenge grids (e.g. one-cell "polish a message")
    communityId: d.varchar({ length: 255 }),
    teamId: d.varchar({ length: 255 }).references(() => teams.id), // nullable: set for a competitive (per-team) grid (ADR-0029)
    mode: d
      .varchar({ length: 20 })
      .notNull()
      .default("collaborative")
      .$type<"collaborative" | "competitive">(),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("active")
      .$type<"active" | "completed" | "abandoned">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("work_grid_challenge_idx").on(t.challengeId),
    index("work_grid_community_idx").on(t.communityId),
    index("work_grid_team_idx").on(t.teamId),
    index("work_grid_status_idx").on(t.status),
  ],
);

export const workGridsRelations = relations(workGrids, ({ many }) => ({
  cells: many(workCells),
}));

// Work cells (a unit of work sitting in a claimable pull queue — ADR-0023)
export const workCells = appSchema.table(
  "work_cell",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gridId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => workGrids.id),
    taskType: d.varchar({ length: 40 }).notNull(),
    verificationMode: d
      .varchar({ length: 20 })
      .notNull()
      .default("self-report")
      .$type<
        "platform-action" | "test" | "self-report" | "peer-review" | "consensus"
      >(),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("pending")
      .$type<"pending" | "claimed" | "completed" | "failed" | "requeued">(),
    claimedBy: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    // Plan 4: a human team member can claim a cell as a peer to a commissioned
    // agent. A cell is claimed by an agent (claimedBy) OR a user
    // (claimedByUserId), never both — enforced by the claim mutations, which
    // set one and null the other. assignedToUserId is a soft planning layer
    // (who the team intends to do it) with no lock.
    claimedByUserId: d.varchar({ length: 255 }).references(() => user.id),
    assignedToUserId: d.varchar({ length: 255 }).references(() => user.id),
    claimedAt: d.timestamp({ withTimezone: true }),
    deadline: d.timestamp({ withTimezone: true }),
    deadlineMinutes: d.integer(),
    progressStatus: d
      .varchar({ length: 20 })
      .notNull()
      .default("todo")
      .$type<"todo" | "in_progress" | "blocked" | "done">(),
    progressNote: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("work_cell_grid_idx").on(t.gridId),
    index("work_cell_status_idx").on(t.status),
    index("work_cell_claimed_by_idx").on(t.claimedBy),
    index("work_cell_claimed_by_user_idx").on(t.claimedByUserId),
  ],
);

export const workCellsRelations = relations(workCells, ({ one, many }) => ({
  grid: one(workGrids, {
    fields: [workCells.gridId],
    references: [workGrids.id],
  }),
  claimer: one(agentProfiles, {
    fields: [workCells.claimedBy],
    references: [agentProfiles.id],
  }),
  claimedByUser: one(user, {
    fields: [workCells.claimedByUserId],
    references: [user.id],
    relationName: "workCells_claimedByUser",
  }),
  assignedToUser: one(user, {
    fields: [workCells.assignedToUserId],
    references: [user.id],
    relationName: "workCells_assignedToUser",
  }),
  results: many(workCellResults),
}));

// Work cell results (returned via outbound submit-cell-result MCP tool — ADR-0023)
export const workCellResults = appSchema.table(
  "work_cell_result",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cellId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => workCells.id),
    // Plan 4: a result is authored by an agent (agentId) OR a human team member
    // (userId), never both. agentId is now nullable for human-authored results.
    agentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    userId: d.varchar({ length: 255 }).references(() => user.id),
    output: d.text(),
    verificationOutcome: d
      .varchar({ length: 20 })
      .notNull()
      .default("pending")
      .$type<"verified" | "failed" | "pending">(),
    verificationDetails: d.json().$type<Record<string, unknown>>(),
    submittedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    verifiedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("work_cell_result_cell_idx").on(t.cellId),
    index("work_cell_result_agent_idx").on(t.agentId),
    uniqueIndex("work_cell_result_cell_uidx").on(t.cellId),
  ],
);

export const workCellResultsRelations = relations(
  workCellResults,
  ({ one }) => ({
    cell: one(workCells, {
      fields: [workCellResults.cellId],
      references: [workCells.id],
    }),
    agent: one(agentProfiles, {
      fields: [workCellResults.agentId],
      references: [agentProfiles.id],
    }),
    user: one(user, {
      fields: [workCellResults.userId],
      references: [user.id],
    }),
  }),
);

// Notebook messages (human ↔ agent async conversation)
export const notebookMessages = appSchema.table(
  "notebook_message",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => agentProfiles.id),
    ownerId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    role: d.varchar({ length: 10 }).notNull(), // "human" | "agent"
    content: d.text().notNull(),
    metadata: d.json().$type<Record<string, unknown>>(),
    readAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("notebook_messages_agent_created_idx").on(t.agentId, t.createdAt),
  ],
);

// Conversations (inbox messaging system)
export const conversations = appSchema.table("conversation", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: d.varchar({ length: 10 }).notNull(), // "agent" | "dm"
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date()),
}));

export const conversationParticipants = appSchema.table(
  "conversation_participant",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => conversations.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    joinedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lastReadAt: d.timestamp({ withTimezone: true }),
    isPinned: d.boolean().default(false).notNull(),
  }),
  (t) => [
    uniqueIndex("conv_participant_unique_idx").on(t.conversationId, t.userId),
    index("conv_participant_user_idx").on(t.userId),
  ],
);

export const messages = appSchema.table(
  "message",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => conversations.id),
    senderId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    senderType: d.varchar({ length: 10 }).notNull().default("human"), // "human" | "agent"
    content: d.text().notNull(),
    metadata: d.json().$type<Record<string, unknown>>(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [index("messages_conv_created_idx").on(t.conversationId, t.createdAt)],
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(user, {
      fields: [conversationParticipants.userId],
      references: [user.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
  }),
}));

// ─── AI Brand Benchmark ──────────────────────────────────────────────────────

export const benchmarkCategories = appSchema.table(
  "benchmark_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    parentIdx: index("benchmark_category_parent_idx").on(t.parentId),
  }),
);

export const benchmarkIntents = appSchema.table("benchmark_intent", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const benchmarkPrompts = appSchema.table(
  "benchmark_prompt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    text: text("text").notNull(),
    categoryId: uuid("category_id").notNull(),
    // Category slugs inferred by the extractor LLM after it sees an
    // answer. Supplements the author's primary categoryId so a prompt
    // can surface under multiple categories it actually covers.
    inferredCategoryIds: uuid("inferred_category_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    intentId: uuid("intent_id").notNull(),
    locale: text("locale").notNull().default("en-US"),
    status: text("status").notNull().default("pending"),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("benchmark_prompt_status_idx").on(t.status),
    categoryIdx: index("benchmark_prompt_category_idx").on(t.categoryId),
  }),
);

export const brands = appSchema.table("brand", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalName: text("canonical_name").notNull(),
  slug: text("slug").notNull().unique(),
  aliases: text("aliases")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  website: text("website"),
  categoryIds: uuid("category_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::uuid[]`),
  commitmentRenewablePct: numeric("commitment_renewable_pct", {
    mode: "number",
  }),
  commitmentTargetYear: integer("commitment_target_year"),
  commitmentSourceUrl: text("commitment_source_url"),
  commitmentNotes: text("commitment_notes"),
  jurisdiction: text("jurisdiction"),
  jurisdictionRegion: text("jurisdiction_region"),
  entityType: text("entity_type"),
  ultimateBeneficialOwner: text("ultimate_beneficial_owner"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const SUBSIDY_KINDS = [
  "tax-abatement",
  "grant",
  "infrastructure",
  "ppa-discount",
  "land",
  "training",
  "other",
] as const;
export type SubsidyKind = (typeof SUBSIDY_KINDS)[number];

export const PERMIT_KINDS = [
  "zoning",
  "environmental",
  "water",
  "grid-interconnect",
  "building",
  "other",
] as const;
export type PermitKind = (typeof PERMIT_KINDS)[number];

export const PERMIT_STATUS = [
  "pending",
  "granted",
  "denied",
  "withdrawn",
] as const;
export type PermitStatus = (typeof PERMIT_STATUS)[number];

export const ownershipEdges = appSchema.table(
  "ownership_edge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentBrandId: uuid("parent_brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    childBrandId: uuid("child_brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    ownershipPct: numeric("ownership_pct", { mode: "number" }),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    parentIdx: index("ownership_edge_parent_idx").on(t.parentBrandId),
    childIdx: index("ownership_edge_child_idx").on(t.childBrandId),
  }),
);

export const subsidies = appSchema.table(
  "subsidy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datacenterId: uuid("datacenter_id").references(() => datacenters.id, {
      onDelete: "set null",
    }),
    recipientBrandId: uuid("recipient_brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    awardedBy: text("awarded_by").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    amountUsd: numeric("amount_usd", { mode: "number" }),
    announcedDate: date("announced_date"),
    effectiveDate: date("effective_date"),
    termYears: integer("term_years"),
    claimedJobs: integer("claimed_jobs"),
    claimedCapexUsd: numeric("claimed_capex_usd", { mode: "number" }),
    sources: jsonb("sources")
      .$type<DatacenterSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dcIdx: index("subsidy_datacenter_idx").on(t.datacenterId),
    recipientIdx: index("subsidy_recipient_idx").on(t.recipientBrandId),
    jurisdictionIdx: index("subsidy_jurisdiction_idx").on(t.jurisdiction),
  }),
);

export const permits = appSchema.table(
  "permit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datacenterId: uuid("datacenter_id")
      .notNull()
      .references(() => datacenters.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    issuingBody: text("issuing_body").notNull(),
    appliedDate: date("applied_date"),
    issuedDate: date("issued_date"),
    status: text("status").notNull().default("granted"),
    sources: jsonb("sources")
      .$type<DatacenterSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dcIdx: index("permit_datacenter_idx").on(t.datacenterId),
    kindIdx: index("permit_kind_idx").on(t.kind),
  }),
);

export const datacenterStatusHistory = appSchema.table(
  "datacenter_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datacenterId: uuid("datacenter_id")
      .notNull()
      .references(() => datacenters.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    effectiveDate: date("effective_date").notNull(),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dcIdx: index("dc_status_history_dc_idx").on(t.datacenterId),
    dateIdx: index("dc_status_history_date_idx").on(t.effectiveDate),
  }),
);

export const brandWatches = appSchema.table(
  "brand_watch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("brand_watch_user_idx").on(t.userId),
    brandIdx: index("brand_watch_brand_idx").on(t.brandId),
    userBrandUq: uniqueIndex("brand_watch_user_brand_uq").on(
      t.userId,
      t.brandId,
    ),
  }),
);

// BYOA assignment statuses. `held` = contributor has it and may submit
// runs against its prompts; `completed` = explicitly marked done by the
// contributor (or all prompts submitted); `expired` = past `expiresAt`
// or explicitly released. See ADR-0008 Step 5.
export type BenchmarkAssignmentStatus = "held" | "completed" | "expired";

export const benchmarkAssignments = appSchema.table(
  "benchmark_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    agentId: uuid("agent_id"),
    promptIds: uuid("prompt_ids").array().notNull(),
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    modelSurface: text("model_surface").$type<ModelSurface>(),
    locale: text("locale").notNull().default("en-US"),
    status: text("status")
      .notNull()
      .default("held")
      .$type<BenchmarkAssignmentStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userStatusIdx: index("benchmark_assignment_user_status_idx").on(
      t.userId,
      t.status,
    ),
    agentIdx: index("benchmark_assignment_agent_idx").on(t.agentId),
    statusExpiresIdx: index("benchmark_assignment_status_expires_idx").on(
      t.status,
      t.expiresAt,
    ),
  }),
);

// model_surface and proxy_status are Postgres enums in the app schema.
// See migration 20260518_benchmark_surface_and_proxy. We declare the
// columns as text + $type<>() to follow the prevailing pattern in this
// file (see eventRegistrations.status) while still getting compile-time
// safety and database-level enforcement.
export type ModelSurface =
  | "chatgpt_grounded"
  | "chatgpt_ungrounded"
  | "claude_grounded"
  | "claude_ungrounded"
  | "gemini_grounded"
  | "gemini_ungrounded"
  | "perplexity"
  | "kimi_grounded"
  | "legacy_unverified";

export type ProxyStatus = "queued" | "running" | "done" | "failed";

export const benchmarkRuns = appSchema.table(
  "benchmark_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptId: uuid("prompt_id").notNull(),
    // Nullable so auto-seeded proxy runs (no human submitter) can be stored.
    // Contributor-submitted rows continue to populate this. See ADR-0005.
    submittedByUserId: text("submitted_by_user_id"),
    agentId: uuid("agent_id"),
    assignmentId: uuid("assignment_id"),
    modelProvider: text("model_provider").notNull(),
    // Nullable under BYOA: contributors generally don't know the specific
    // model id / SKU their AI product shipped. `model_surface` is the
    // primary slicing key. See ADR-0006 + migration 20260518b.
    modelId: text("model_id"),
    modelVersion: text("model_version"),
    modelSurface: text("model_surface")
      .notNull()
      .default("legacy_unverified")
      .$type<ModelSurface>(),
    temperature: numeric("temperature"),
    rawAnswer: text("raw_answer").notNull(),
    locale: text("locale").notNull().default("en-US"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    extractionAttempts: integer("extraction_attempts").notNull().default(0),
    proxyStatus: text("proxy_status")
      .notNull()
      .default("done")
      .$type<ProxyStatus>(),
    proxyResponseRaw: jsonb("proxy_response_raw"),
    costCents: integer("cost_cents"),
    providerResponseId: text("provider_response_id"),
    weight: numeric("weight").notNull().default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    promptModelTimeIdx: index("benchmark_run_prompt_model_time_idx").on(
      t.promptId,
      t.modelId,
      t.capturedAt,
    ),
    extractionStatusIdx: index("benchmark_run_extraction_status_idx").on(
      t.extractionStatus,
    ),
    assignmentIdx: index("benchmark_run_assignment_idx").on(t.assignmentId),
    surfaceCapturedIdx: index("benchmark_run_surface_captured_idx").on(
      t.modelSurface,
      t.capturedAt,
    ),
    proxyStatusIdx: index("benchmark_run_proxy_status_idx").on(t.proxyStatus),
  }),
);

export const benchmarkBrandMentions = appSchema.table(
  "benchmark_brand_mention",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    rawMention: text("raw_mention").notNull(),
    brandId: uuid("brand_id"),
    rank: integer("rank"),
    sentiment: text("sentiment").notNull(),
    context: text("context"),
    confidence: numeric("confidence").notNull().default("0.5"),
    extractorVersion: text("extractor_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("benchmark_brand_mention_brand_idx").on(t.brandId),
    runIdx: index("benchmark_brand_mention_run_idx").on(t.runId),
  }),
);

export type RunSourceKind = "source" | "citation";

export type RunSourceType =
  | "editorial"
  | "corporate"
  | "user_generated"
  | "reference"
  | "owned_site"
  | "competitor_site"
  | "unknown";

export type RunSourceBrandRelation =
  | "own"
  | "competitor"
  | "neutral"
  | "unknown";

export const benchmarkRunSources = appSchema.table(
  "benchmark_run_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    snippet: text("snippet"),
    position: integer("position"),
    kind: text("kind").notNull().$type<RunSourceKind>(),
    sourceType: text("source_type")
      .notNull()
      .default("unknown")
      .$type<RunSourceType>(),
    brandRelation: text("brand_relation")
      .notNull()
      .default("unknown")
      .$type<RunSourceBrandRelation>(),
    explicitCitation: boolean("explicit_citation").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    runIdx: index("benchmark_run_source_run_idx").on(t.runId),
    domainIdx: index("benchmark_run_source_domain_idx").on(t.domain),
  }),
);

export const brandAliasQueue = appSchema.table(
  "brand_alias_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawMention: text("raw_mention").notNull(),
    suggestedBrandId: uuid("suggested_brand_id"),
    runId: uuid("run_id"),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("brand_alias_queue_status_idx").on(t.status),
  }),
);

export const aggBrandRankByPrompt = appSchema.table(
  "agg_brand_rank_by_prompt",
  {
    promptId: uuid("prompt_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    modelId: text("model_id").notNull(),
    windowDays: integer("window_days").notNull(),
    mentionCount: integer("mention_count").notNull(),
    weightedScore: numeric("weighted_score").notNull(),
    avgRank: numeric("avg_rank"),
    sentimentPositivePct: numeric("sentiment_positive_pct")
      .notNull()
      .default("0"),
    sentimentNeutralPct: numeric("sentiment_neutral_pct")
      .notNull()
      .default("0"),
    sentimentNegativePct: numeric("sentiment_negative_pct")
      .notNull()
      .default("0"),
    citationDomainsTop5: text("citation_domains_top5")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const aggBrandTrendsByDay = appSchema.table("agg_brand_trends_by_day", {
  brandId: uuid("brand_id").notNull(),
  modelId: text("model_id").notNull(),
  categoryId: uuid("category_id").notNull(),
  date: date("date").notNull(),
  mentionPct: numeric("mention_pct").notNull(),
  runCount: integer("run_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aggModelBiasMatrix = appSchema.table("agg_model_bias_matrix", {
  promptId: uuid("prompt_id").notNull(),
  modelId: text("model_id").notNull(),
  topBrandIds: jsonb("top_brand_ids").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aggTopBrandByCategory = appSchema.table(
  "agg_top_brand_by_category",
  {
    categoryId: uuid("category_id").notNull(),
    windowDays: integer("window_days").notNull(),
    modelScope: text("model_scope").notNull(),
    brandId: uuid("brand_id").notNull(),
    brandSlug: text("brand_slug").notNull(),
    brandCanonicalName: text("brand_canonical_name").notNull(),
    mentionCount: integer("mention_count").notNull(),
    totalAnswers: integer("total_answers").notNull(),
    sharePct: numeric("share_pct").notNull(),
    runnerUpBrandId: uuid("runner_up_brand_id"),
    runnerUpCanonicalName: text("runner_up_canonical_name"),
    runnerUpSharePct: numeric("runner_up_share_pct"),
    modelsSampled: integer("models_sampled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    windowIdx: index("agg_top_brand_window_idx").on(t.windowDays),
  }),
);

export const benchmarkCitations = appSchema.table(
  "benchmark_citation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    snippet: text("snippet"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    runIdx: index("benchmark_citation_run_idx").on(t.runId),
    domainIdx: index("benchmark_citation_domain_idx").on(t.domain),
    runUrlUq: uniqueIndex("benchmark_citation_run_url_uq").on(t.runId, t.url),
  }),
);

export const aggCitationByBrand = appSchema.table(
  "agg_citation_by_brand",
  {
    brandId: uuid("brand_id").notNull(),
    categoryId: uuid("category_id"),
    modelId: text("model_id").notNull(),
    windowDays: integer("window_days").notNull(),
    domain: text("domain").notNull(),
    citationCount: integer("citation_count").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_citation_by_brand_brand_idx").on(
      t.brandId,
      t.windowDays,
    ),
  }),
);

export const aggBrandVisibilityByModel = appSchema.table(
  "agg_brand_visibility_by_model",
  {
    brandId: uuid("brand_id").notNull(),
    modelId: text("model_id").notNull(),
    windowDays: integer("window_days").notNull(),
    primaryCategoryId: uuid("primary_category_id"),
    mentionsCount: integer("mentions_count").notNull(),
    runsTotal: integer("runs_total").notNull(),
    visibilityPct: numeric("visibility_pct").notNull(),
    avgRank: numeric("avg_rank"),
    sentimentPosPct: numeric("sentiment_pos_pct").notNull().default("0"),
    sentimentNeuPct: numeric("sentiment_neu_pct").notNull().default("0"),
    sentimentNegPct: numeric("sentiment_neg_pct").notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_brand_visibility_by_model_brand_idx").on(
      t.brandId,
      t.windowDays,
    ),
  }),
);

/**
 * Visibility per (brand, model_surface, window). Excludes runs with
 * model_surface='legacy_unverified' from both numerator and denominator —
 * legacy contributor-submitted runs are not trust-grade evidence.
 * See ADR-0001 and ADR-0004.
 */
export const aggBrandVisibilityBySurface = appSchema.table(
  "agg_brand_visibility_by_surface",
  {
    brandId: uuid("brand_id").notNull(),
    modelSurface: text("model_surface").notNull().$type<ModelSurface>(),
    windowDays: integer("window_days").notNull(),
    primaryCategoryId: uuid("primary_category_id"),
    mentionsCount: integer("mentions_count").notNull(),
    runsTotal: integer("runs_total").notNull(),
    visibilityPct: numeric("visibility_pct").notNull(),
    avgRank: numeric("avg_rank"),
    sentimentPosPct: numeric("sentiment_pos_pct").notNull().default("0"),
    sentimentNeuPct: numeric("sentiment_neu_pct").notNull().default("0"),
    sentimentNegPct: numeric("sentiment_neg_pct").notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_brand_visibility_by_surface_brand_idx").on(
      t.brandId,
      t.windowDays,
    ),
  }),
);

/**
 * Per-cell coverage status: distinct contributors per
 * (prompt, model_surface) per window. Powers the coverage map and the
 * ≥3-distinct-contributor surface threshold from ADR-0007 decision 2.
 * `legacy_unverified` runs are excluded.
 */
export const aggCoverageByCell = appSchema.table(
  "agg_coverage_by_cell",
  {
    promptId: uuid("prompt_id").notNull(),
    modelSurface: text("model_surface").notNull().$type<ModelSurface>(),
    windowDays: integer("window_days").notNull(),
    distinctContributors: integer("distinct_contributors").notNull(),
    runsTotal: integer("runs_total").notNull(),
    meetsThreshold: boolean("meets_threshold").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    thresholdIdx: index("agg_coverage_by_cell_threshold_idx").on(
      t.windowDays,
      t.meetsThreshold,
    ),
    promptIdx: index("agg_coverage_by_cell_prompt_idx").on(
      t.promptId,
      t.windowDays,
    ),
  }),
);

export const aggBrandVisibilityByDay = appSchema.table(
  "agg_brand_visibility_by_day",
  {
    brandId: uuid("brand_id").notNull(),
    date: date("date").notNull(),
    modelId: text("model_id").notNull(),
    mentionsCount: integer("mentions_count").notNull(),
    runsTotal: integer("runs_total").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_brand_visibility_by_day_brand_idx").on(
      t.brandId,
      t.date,
    ),
  }),
);

// ── Launchpad ────────────────────────────────────────────────────────────────

export const launchpadUpdates = appSchema.table(
  "launchpad_update",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: d.integer().notNull(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    title: d.varchar({ length: 500 }).notNull(),
    content: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("launchpad_update_project_idx").on(t.projectId),
    index("launchpad_update_author_idx").on(t.authorId),
  ],
);

export const launchpadComments = appSchema.table(
  "launchpad_comment",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: d.integer().notNull(),
    authorId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    content: d.text().notNull(),
    parentId: d.varchar({ length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("launchpad_comment_project_idx").on(t.projectId),
    index("launchpad_comment_author_idx").on(t.authorId),
    index("launchpad_comment_parent_idx").on(t.parentId),
  ],
);

export const launchpadVotes = appSchema.table(
  "launchpad_vote",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: d.integer().notNull(),
    voterId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("launchpad_vote_project_voter_idx").on(t.projectId, t.voterId),
  ],
);

// ── Launchpad Relations ──────────────────────────────────────────────────────

export const launchpadUpdateRelations = relations(
  launchpadUpdates,
  ({ one }) => ({
    author: one(user, {
      fields: [launchpadUpdates.authorId],
      references: [user.id],
    }),
  }),
);

export const launchpadCommentRelations = relations(
  launchpadComments,
  ({ one }) => ({
    author: one(user, {
      fields: [launchpadComments.authorId],
      references: [user.id],
    }),
    parent: one(launchpadComments, {
      fields: [launchpadComments.parentId],
      references: [launchpadComments.id],
    }),
  }),
);

export const launchpadVoteRelations = relations(launchpadVotes, ({ one }) => ({
  voter: one(user, {
    fields: [launchpadVotes.voterId],
    references: [user.id],
  }),
}));

// ── Communities (multi-tenancy) ─────────────────────────────
export const communities = appSchema.table(
  "community",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: d.text().notNull().unique(),
    slug: d.text().notNull().unique(),
    description: d.text(),
    logoUrl: d.text(),
    joinPolicy: d
      .varchar({ length: 30 })
      .notNull()
      .default("open")
      .$type<"open" | "invite_only" | "approval_required">(),
    isListedInDirectory: d.boolean().notNull().default(false),
    feedPostPolicy: d
      .varchar({ length: 30 })
      .notNull()
      .default("all_members")
      .$type<"all_members" | "admins_only">(),
    classroomCreatePolicy: d
      .varchar({ length: 30 })
      .notNull()
      .default("all_members")
      .$type<"all_members" | "admins_only">(),
    autonomyLevel: d
      .varchar("autonomy_level", { length: 10 })
      .notNull()
      .default("suggest")
      .$type<"off" | "suggest">(),
    createdBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    deletedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("community_slug_idx").on(t.slug),
    index("community_listed_idx").on(t.isListedInDirectory),
  ],
);

// ── Classroom enrollment / completion tracking (mirrors eventRegistrations) ──
export const courseEnrollments = appSchema.table(
  "course_enrollment",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: d.integer().notNull(), // References Payload courses table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    enrolledAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("course_enrollment_course_idx").on(t.courseId),
    index("course_enrollment_user_idx").on(t.userId),
    uniqueIndex("course_enrollment_unique").on(t.courseId, t.userId),
  ],
);

export const lessonCompletions = appSchema.table(
  "lesson_completion",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lessonId: d.integer().notNull(), // References Payload lessons table
    courseId: d.integer().notNull(), // References Payload courses table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    completedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("lesson_completion_course_idx").on(t.courseId),
    index("lesson_completion_user_idx").on(t.userId),
    uniqueIndex("lesson_completion_unique").on(t.lessonId, t.userId),
  ],
);

export const lessonExamAttempts = appSchema.table(
  "lesson_exam_attempt",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lessonId: d.integer().notNull(), // References Payload lessons table
    courseId: d.integer().notNull(), // References Payload courses table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    score: d.integer().notNull(), // 0..100
    thresholdAtAttempt: d.integer().notNull(), // threshold in force when taken
    passed: d.boolean().notNull(),
    answers: d.jsonb().notNull(), // ExamAnswer[] snapshot
    attemptedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("lesson_exam_attempt_lesson_user_idx").on(t.lessonId, t.userId),
    index("lesson_exam_attempt_course_idx").on(t.courseId),
  ],
);

export const courseCertificates = appSchema.table(
  "course_certificate",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: d.integer().notNull(), // References Payload courses table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    issuedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("course_certificate_user_idx").on(t.userId),
    uniqueIndex("course_certificate_unique").on(t.courseId, t.userId),
  ],
);

/** Hackathon certificates, issued at finalize (winner = member of the team
 *  that actually received the prize, participant = member of any other
 *  submitted team). One certificate per user per challenge — the unique index
 *  makes finalize re-runs structurally idempotent (ON CONFLICT DO NOTHING). */
export const hackathonCertificates = appSchema.table(
  "hackathon_certificate",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    kind: d.varchar({ length: 20 }).notNull().$type<"winner" | "participant">(),
    issuedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("hackathon_certificate_user_idx").on(t.userId),
    uniqueIndex("hackathon_certificate_unique").on(t.challengeId, t.userId),
  ],
);

/** People's Choice votes on submitted gallery projects (#169). One vote per
 *  member per hackathon — the unique (challenge_id, user_id) index is the
 *  uniqueness guarantee; "changeable while voting is open" is an UPSERT that
 *  retargets team_id. Deliberately NON-SCORING (ADR-0029): nothing reads this
 *  table in the scoring/finalize path — it powers a parallel recognition
 *  award only. */
export const hackathonVotes = appSchema.table(
  "hackathon_vote",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("hackathon_vote_team_idx").on(t.teamId),
    uniqueIndex("hackathon_vote_unique").on(t.challengeId, t.userId),
  ],
);

export const communityLumaIntegrations = appSchema.table(
  "community_luma_integration",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .unique()
      .references(() => communities.id),
    apiKeyEncrypted: d.text().notNull(),
    calendarApiId: d.text().notNull().default(""),
    calendarName: d.text(),
    tagFilters: d.jsonb().$type<string[]>(),
    isEnabled: d.boolean().notNull().default(false),
    lastSyncCheck: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index("luma_integration_community_idx").on(t.communityId)],
);

export const communityMemberships = appSchema.table(
  "community_membership",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    role: d
      .varchar({ length: 20 })
      .notNull()
      .default("member")
      .$type<"owner" | "admin" | "moderator" | "member">(),
    status: d
      .varchar({ length: 30 })
      .notNull()
      .default("active")
      .$type<"active" | "pending_approval" | "invited" | "banned">(),
    joinedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    invitedBy: d.varchar({ length: 255 }).references(() => user.id),
  }),
  (t) => [
    uniqueIndex("membership_community_user_uidx").on(t.communityId, t.userId),
    index("membership_user_idx").on(t.userId),
    index("membership_community_status_idx").on(t.communityId, t.status),
    index("membership_community_role_idx").on(t.communityId, t.role),
  ],
);

export const communityInvites = appSchema.table(
  "community_invite",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    code: d.text().notNull().unique(),
    createdBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    maxUses: d.integer(),
    useCount: d.integer().notNull().default(0),
    expiresAt: d.timestamp({ withTimezone: true }),
    role: d.varchar({ length: 32 }),
    targetEmail: d.varchar({ length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("invite_community_idx").on(t.communityId),
    uniqueIndex("invite_code_uidx").on(t.code),
  ],
);

export const communityRelations = relations(communities, ({ many, one }) => ({
  memberships: many(communityMemberships),
  invites: many(communityInvites),
  creator: one(user, {
    fields: [communities.createdBy],
    references: [user.id],
  }),
}));

export const communityMembershipRelations = relations(
  communityMemberships,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityMemberships.communityId],
      references: [communities.id],
    }),
    user: one(user, {
      fields: [communityMemberships.userId],
      references: [user.id],
      relationName: "membershipUser",
    }),
    inviter: one(user, {
      fields: [communityMemberships.invitedBy],
      references: [user.id],
      relationName: "membershipInviter",
    }),
  }),
);

export const communityInviteRelations = relations(
  communityInvites,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityInvites.communityId],
      references: [communities.id],
    }),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Datacenter research (community-tracked AI datacenter ecosystem)
// ────────────────────────────────────────────────────────────────────

export const DATACENTER_STATUS = [
  "announced",
  "under-construction",
  "operational",
  "expanding",
  "decommissioned",
  "cancelled",
] as const;
export type DatacenterStatus = (typeof DATACENTER_STATUS)[number];

export const POWER_SOURCE = [
  "grid-mixed",
  "gas",
  "nuclear",
  "solar",
  "wind",
  "hydro",
  "geothermal",
  "hybrid",
] as const;
export type PowerSource = (typeof POWER_SOURCE)[number];

export const COOLING_TYPE = [
  "air",
  "open-loop",
  "closed-loop",
  "direct-to-chip",
  "immersion",
] as const;
export type CoolingType = (typeof COOLING_TYPE)[number];

export const SUPPLIER_CATEGORY = [
  "gc",
  "civil",
  "electrical",
  "transformer",
  "backup-power",
  "cooling",
  "fiber",
  "hardware",
  "security",
  "staffing",
  "other",
] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORY)[number];

export const ENERGY_DEAL_TYPE = [
  "ppa",
  "vppa",
  "grid",
  "behind-meter",
  "nuclear",
  "on-site",
] as const;
export type EnergyDealType = (typeof ENERGY_DEAL_TYPE)[number];

export const ENERGY_TYPE = [
  "solar",
  "wind",
  "nuclear",
  "gas",
  "hydro",
  "geothermal",
  "mixed",
] as const;
export type EnergyType = (typeof ENERGY_TYPE)[number];

export const FINDING_STATUS = [
  "draft",
  "review",
  "verified",
  "disputed",
] as const;
export type FindingStatus = (typeof FINDING_STATUS)[number];

export type DatacenterSource = {
  url: string;
  title?: string;
  type?: "news" | "pr" | "filing" | "permit" | "operator" | "other";
  publishedAt?: string;
};

export type DatacenterGpu = {
  model: string;
  count?: number;
};

export const datacenters = appSchema.table(
  "datacenter",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("announced"),
    aiDedicated: boolean("ai_dedicated").notNull().default(false),

    lat: numeric("lat", { mode: "number" }).notNull(),
    lng: numeric("lng", { mode: "number" }).notNull(),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    country: text("country").notNull(),

    capacityMw: numeric("capacity_mw", { mode: "number" }),
    capacityMwPlanned: numeric("capacity_mw_planned", { mode: "number" }),
    squareFootage: numeric("square_footage", { mode: "number" }),
    rackCount: integer("rack_count"),
    gpus: jsonb("gpus")
      .$type<DatacenterGpu[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    primaryPowerSource: text("primary_power_source"),
    utilityId: uuid("utility_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    puePledged: numeric("pue_pledged", { mode: "number" }),

    coolingType: text("cooling_type"),
    waterDrawMgd: numeric("water_draw_mgd", { mode: "number" }),
    waterDrawCubicM: numeric("water_draw_cubic_m", { mode: "number" }),
    wuePledged: numeric("wue_pledged", { mode: "number" }),

    announcedDate: date("announced_date"),
    groundbreakDate: date("groundbreak_date"),
    onlineDate: date("online_date"),
    fullCapacityDate: date("full_capacity_date"),

    capexUsd: numeric("capex_usd", { mode: "number" }),
    description: text("description"),

    sources: jsonb("sources")
      .$type<DatacenterSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    submittedByUserId: text("submitted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    verified: boolean("verified").notNull().default(false),
    verifiedCount: integer("verified_count").notNull().default(0),

    extractorMetadata: jsonb("extractor_metadata"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    operatorIdx: index("datacenter_operator_idx").on(t.operatorId),
    countryIdx: index("datacenter_country_idx").on(t.country),
    statusIdx: index("datacenter_status_idx").on(t.status),
    verifiedIdx: index("datacenter_verified_idx").on(t.verified),
    locIdx: index("datacenter_loc_idx").on(t.lat, t.lng),
  }),
);

export const datacenterSuppliers = appSchema.table(
  "datacenter_supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datacenterId: uuid("datacenter_id")
      .notNull()
      .references(() => datacenters.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    role: text("role"),
    contractValueUsd: numeric("contract_value_usd", { mode: "number" }),
    isLocal: boolean("is_local").notNull().default(false),
    sources: jsonb("sources")
      .$type<DatacenterSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dcIdx: index("dc_supplier_dc_idx").on(t.datacenterId),
    supplierIdx: index("dc_supplier_supplier_idx").on(t.supplierId),
    categoryIdx: index("dc_supplier_category_idx").on(t.category),
    uq: uniqueIndex("dc_supplier_dc_supplier_category_uq").on(
      t.datacenterId,
      t.supplierId,
      t.category,
    ),
  }),
);

export const energyDeals = appSchema.table(
  "energy_deal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    datacenterId: uuid("datacenter_id").references(() => datacenters.id, {
      onDelete: "set null",
    }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    energyType: text("energy_type"),
    mw: numeric("mw", { mode: "number" }),
    termYears: numeric("term_years", { mode: "number" }),
    signedDate: date("signed_date"),
    startDate: date("start_date"),
    valueUsd: numeric("value_usd", { mode: "number" }),
    sources: jsonb("sources")
      .$type<DatacenterSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dcIdx: index("energy_deal_dc_idx").on(t.datacenterId),
    buyerIdx: index("energy_deal_buyer_idx").on(t.buyerId),
    counterpartyIdx: index("energy_deal_counterparty_idx").on(t.counterpartyId),
    signedIdx: index("energy_deal_signed_idx").on(t.signedDate),
  }),
);

export const datacenterFindings = appSchema.table(
  "datacenter_finding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datacenterId: uuid("datacenter_id").references(() => datacenters.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    claim: text("claim"),
    evidenceUrls: jsonb("evidence_urls")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("review"),
    upvotes: integer("upvotes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dcIdx: index("dc_finding_dc_idx").on(t.datacenterId),
    userIdx: index("dc_finding_user_idx").on(t.userId),
    statusIdx: index("dc_finding_status_idx").on(t.status),
  }),
);

export const datacenterFindingVotes = appSchema.table(
  "datacenter_finding_vote",
  {
    findingId: uuid("finding_id")
      .notNull()
      .references(() => datacenterFindings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: integer("vote").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("dc_finding_vote_pk").on(t.findingId, t.userId),
    findingIdx: index("dc_finding_vote_finding_idx").on(t.findingId),
  }),
);

export const investigationEdit = appSchema.table(
  "investigation_edit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    op: text("op").notNull(),
    patch: jsonb("patch").$type<Record<string, unknown>>().notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    sources: jsonb("sources")
      .$type<
        { url: string; title?: string; type?: string; publishedAt?: string }[]
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agentProfiles.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("live"),
    trueVotes: integer("true_votes").notNull().default(0),
    falseVotes: integer("false_votes").notNull().default(0),
    revertedByEditId: uuid("reverted_by_edit_id").references(
      (): AnyPgColumn => investigationEdit.id,
      { onDelete: "set null" },
    ),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("inv_edit_entity_idx").on(t.entityType, t.entityId),
    userIdx: index("inv_edit_user_idx").on(t.userId),
    statusIdx: index("inv_edit_status_idx").on(t.status),
    createdIdx: index("inv_edit_created_idx").on(t.createdAt),
  }),
);

export const investigationEditVote = appSchema.table(
  "investigation_edit_vote",
  {
    editId: uuid("edit_id")
      .notNull()
      .references(() => investigationEdit.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: integer("vote").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("inv_edit_vote_pk").on(t.editId, t.userId),
  }),
);

export const investigationEditRelations = relations(
  investigationEdit,
  ({ one, many }) => ({
    user: one(user, {
      fields: [investigationEdit.userId],
      references: [user.id],
      relationName: "investigation_edit_author",
    }),
    resolvedBy: one(user, {
      fields: [investigationEdit.resolvedByUserId],
      references: [user.id],
      relationName: "investigation_edit_resolved_by",
    }),
    revertedBy: one(investigationEdit, {
      fields: [investigationEdit.revertedByEditId],
      references: [investigationEdit.id],
      relationName: "investigation_edit_revert",
    }),
    agent: one(agentProfiles, {
      fields: [investigationEdit.agentId],
      references: [agentProfiles.id],
    }),
    votes: many(investigationEditVote),
  }),
);

export const investigationEditVoteRelations = relations(
  investigationEditVote,
  ({ one }) => ({
    edit: one(investigationEdit, {
      fields: [investigationEditVote.editId],
      references: [investigationEdit.id],
    }),
    user: one(user, {
      fields: [investigationEditVote.userId],
      references: [user.id],
    }),
  }),
);

export const datacenterRelations = relations(datacenters, ({ one, many }) => ({
  operator: one(brands, {
    fields: [datacenters.operatorId],
    references: [brands.id],
    relationName: "datacenter_operator",
  }),
  utility: one(brands, {
    fields: [datacenters.utilityId],
    references: [brands.id],
    relationName: "datacenter_utility",
  }),
  submittedBy: one(user, {
    fields: [datacenters.submittedByUserId],
    references: [user.id],
  }),
  suppliers: many(datacenterSuppliers),
  energyDeals: many(energyDeals),
  findings: many(datacenterFindings),
}));

export const datacenterSupplierRelations = relations(
  datacenterSuppliers,
  ({ one }) => ({
    datacenter: one(datacenters, {
      fields: [datacenterSuppliers.datacenterId],
      references: [datacenters.id],
    }),
    supplier: one(brands, {
      fields: [datacenterSuppliers.supplierId],
      references: [brands.id],
    }),
  }),
);

export const energyDealRelations = relations(energyDeals, ({ one }) => ({
  datacenter: one(datacenters, {
    fields: [energyDeals.datacenterId],
    references: [datacenters.id],
  }),
  buyer: one(brands, {
    fields: [energyDeals.buyerId],
    references: [brands.id],
    relationName: "energy_deal_buyer",
  }),
  counterparty: one(brands, {
    fields: [energyDeals.counterpartyId],
    references: [brands.id],
    relationName: "energy_deal_counterparty",
  }),
}));

export const datacenterFindingRelations = relations(
  datacenterFindings,
  ({ one }) => ({
    datacenter: one(datacenters, {
      fields: [datacenterFindings.datacenterId],
      references: [datacenters.id],
    }),
    user: one(user, {
      fields: [datacenterFindings.userId],
      references: [user.id],
    }),
  }),
);
