import { relations, sql } from "drizzle-orm";
import { index, uniqueIndex } from "drizzle-orm/pg-core";
import { appSchema, user } from "./schema";

// ── Communities ─────────────────────────────────────────────
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

// ── Memberships ─────────────────────────────────────────────
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

// ── Invites ─────────────────────────────────────────────────
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

// ── Relations ───────────────────────────────────────────────
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
