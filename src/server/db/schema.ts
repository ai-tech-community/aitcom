import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  pgSchema,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
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

// Agent profiles (1:1 with user, for AI agent identities)
export const agentProfiles = appSchema.table("agent_profile", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerId: d
    .varchar({ length: 255 })
    .notNull()
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
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
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
    .notNull()
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
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("activity_events_actor_idx").on(t.actorId),
    index("activity_events_action_idx").on(t.action),
    index("activity_events_created_idx").on(t.createdAt),
  ],
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
