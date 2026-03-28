import { relations, sql } from "drizzle-orm";
import {
  index,
  pgSchema,
  uniqueIndex,
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
      .$type<"registered" | "waitlisted" | "cancelled" | "attended" | "pending_payment" | "payment_failed">(),
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
    skills: d
      .json()
      .$type<string[]>()
      .default([])
      .notNull(),
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
  (t) => [
    index("member_profile_xp_idx").on(t.xp),
  ],
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

export const onboardingStepRelations = relations(onboardingSteps, ({ one }) => ({
  user: one(user, {
    fields: [onboardingSteps.userId],
    references: [user.id],
  }),
}));

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
  expertiseTags: d
    .json()
    .$type<string[]>()
    .default([]),
  description: d.text(),
  visibilityMode: d
    .varchar({ length: 20 })
    .notNull()
    .default("visible"),
  status: d.varchar({ length: 20 }).notNull().default("active"),
  totalContributions: d
    .integer()
    .notNull()
    .default(0),
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
  ownerId: d
    .varchar({ length: 255 })
    .references(() => user.id),
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
  usedByAgentId: d
    .varchar({ length: 255 })
    .references(() => agentProfiles.id),
  expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

export const agentInviteCodesRelations = relations(agentInviteCodes, ({ one }) => ({
  creator: one(user, {
    fields: [agentInviteCodes.createdBy],
    references: [user.id],
  }),
  agent: one(agentProfiles, {
    fields: [agentInviteCodes.usedByAgentId],
    references: [agentProfiles.id],
  }),
}));

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
    type: d.varchar({ length: 50 }).notNull(), // "challenge_advisory" | "stale_review_reminder" | "challenge_digest"
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
  (t) => [
    index("notification_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, {
    fields: [notifications.userId],
    references: [user.id],
  }),
}));

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
  categories: d
    .json()
    .$type<string[]>()
    .notNull()
    .default([]),
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
  ],
);

// Aggregate tables for impact analytics
export const dailyCoreMetrics = appSchema.table("daily_core_metrics", (d) => ({
  date: d.date().notNull().primaryKey(),
  totalContributions: d.integer().notNull().default(0),
  aiAssisted: d.integer().notNull().default(0),
  humanReviewed: d.integer().notNull().default(0),
  collaborationRate: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  forumHelpfulness: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  medianResponseMinutes: d.integer(),
  challengeParticipation: d.integer().notNull().default(0),
  challengeCompletion: d.integer().notNull().default(0),
  eventParticipation: d.integer().notNull().default(0),
  growth4w: d.numeric({ precision: 6, scale: 1 }).notNull().default("0"),
  computedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}));

export const dailyExperimentalMetrics = appSchema.table("daily_experimental_metrics", (d) => ({
  date: d.date().notNull().primaryKey(),
  personalityDistribution: d.json().$type<Record<string, number>>().notNull().default({}),
  overrideRate: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  creativityIndex: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  collaborationDepth: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  ideaToImplMedianMinutes: d.integer(),
  topPairings: d.json().$type<Array<{ pair: [string, string]; count: number }>>().notNull().default([]),
  reuseRatio: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  learningLoopSignal: d.varchar("learning_loop_signal", { length: 20 }).$type<"improving" | "stable" | "declining">().notNull().default("stable"),
  learningLoopData: d.json().$type<Record<string, number>>().notNull().default({}),
  computedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}));

export const dailyCollabMix = appSchema.table("daily_collab_mix", (d) => ({
  date: d.date().notNull().primaryKey(),
  aiOnly: d.integer().notNull().default(0),
  humanOnly: d.integer().notNull().default(0),
  collaborative: d.integer().notNull().default(0),
  computedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
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
  ],
);

export const challengeEnrollmentRelations = relations(
  challengeEnrollments,
  ({ one, many }) => ({
    user: one(user, {
      fields: [challengeEnrollments.userId],
      references: [user.id],
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
  (t) => [
    index("messages_conv_created_idx").on(t.conversationId, t.createdAt),
  ],
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

// Benchmark questions (community-contributed AI evaluation questions)
export const benchmarkQuestions = appSchema.table(
  "benchmark_question",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    question: d.text().notNull(),
    correctAnswer: d.text("correct_answer").notNull(),
    optionB: d.text("option_b").notNull(),
    optionC: d.text("option_c").notNull(),
    optionD: d.text("option_d").notNull(),
    explanation: d.text(),
    topic: d.text().notNull(),
    difficulty: d.text().notNull(),
    contributorId: d
      .text("contributor_id")
      .notNull()
      .references(() => user.id),
    contributorName: d.text("contributor_name").notNull(),
    status: d.text().notNull().default("pending"),
    upvotes: d.integer().notNull().default(0),
    downvotes: d.integer().notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    communityId: d.varchar("community_id", { length: 255 }),
  }),
  (t) => [
    index("benchmark_question_status_idx").on(t.status),
    index("benchmark_question_topic_idx").on(t.topic),
    index("benchmark_question_contributor_idx").on(t.contributorId),
  ],
);

// Benchmark runs (agent evaluation sessions)
export const benchmarkRuns = appSchema.table(
  "benchmark_run",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    agentId: d.uuid("agent_id").notNull(),
    agentName: d.text("agent_name").notNull(),
    ownerId: d.text("owner_id").notNull(),
    totalQuestions: d.integer("total_questions").notNull(),
    correctAnswers: d.integer("correct_answers").notNull(),
    scorePercent: d.numeric("score_percent").notNull(),
    topicFilter: d.text("topic_filter"),
    durationMs: d.integer("duration_ms").notNull(),
    modelId: d.text("model_id"),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("benchmark_run_agent_idx").on(t.agentId),
    index("benchmark_run_score_idx").on(t.scorePercent),
    index("benchmark_run_topic_idx").on(t.topicFilter),
  ],
);

// Benchmark answers (individual answers within a run)
export const benchmarkAnswers = appSchema.table(
  "benchmark_answer",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    runId: d
      .uuid("run_id")
      .notNull()
      .references(() => benchmarkRuns.id),
    questionId: d
      .uuid("question_id")
      .notNull()
      .references(() => benchmarkQuestions.id),
    submittedOption: d.text("submitted_option").notNull(),
    correctOption: d.text("correct_option").notNull(),
    isCorrect: d.boolean("is_correct").notNull(),
    reasoning: d.text(),
  }),
  (t) => [
    index("benchmark_answer_run_idx").on(t.runId),
    index("benchmark_answer_question_idx").on(t.questionId),
  ],
);

// Benchmark votes — prevents duplicate voting (one vote per user per question)
export const benchmarkVotes = appSchema.table(
  "benchmark_vote",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    questionId: d
      .uuid("question_id")
      .notNull()
      .references(() => benchmarkQuestions.id),
    userId: d.text("user_id").notNull().references(() => user.id),
    vote: d.text().notNull(), // 'up' | 'down'
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("benchmark_vote_user_question_idx").on(t.userId, t.questionId),
  ],
);

export const benchmarkQuestionsRelations = relations(
  benchmarkQuestions,
  ({ many }) => ({
    answers: many(benchmarkAnswers),
    votes: many(benchmarkVotes),
  }),
);

export const benchmarkRunsRelations = relations(benchmarkRuns, ({ many }) => ({
  answers: many(benchmarkAnswers),
}));

export const benchmarkAnswersRelations = relations(
  benchmarkAnswers,
  ({ one }) => ({
    run: one(benchmarkRuns, {
      fields: [benchmarkAnswers.runId],
      references: [benchmarkRuns.id],
    }),
    question: one(benchmarkQuestions, {
      fields: [benchmarkAnswers.questionId],
      references: [benchmarkQuestions.id],
    }),
  }),
);

export const benchmarkVotesRelations = relations(benchmarkVotes, ({ one }) => ({
  question: one(benchmarkQuestions, {
    fields: [benchmarkVotes.questionId],
    references: [benchmarkQuestions.id],
  }),
}));

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

export const launchpadVoteRelations = relations(
  launchpadVotes,
  ({ one }) => ({
    voter: one(user, {
      fields: [launchpadVotes.voterId],
      references: [user.id],
    }),
  }),
);

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
    tagFilters: d
      .jsonb()
      .$type<string[]>(),
    isEnabled: d.boolean().notNull().default(false),
    lastSyncCheck: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("luma_integration_community_idx").on(t.communityId),
  ],
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
    uniqueIndex("membership_community_user_uidx").on(
      t.communityId,
      t.userId,
    ),
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
