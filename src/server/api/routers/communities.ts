// src/server/api/routers/communities.ts
import { z } from "zod";
import { and, eq, isNull, ilike, sql, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  communityProcedure,
} from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityInvites,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { generateSlug } from "@/server/communities/slug-utils";
import { canManageRole, type CommunityRole } from "@/server/communities/role-utils";
import { logActivity } from "@/server/agent/activity";

/** Escape SQL LIKE/ILIKE pattern characters */
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export const communitiesRouter = createTRPCRouter({
  /** Browse listed communities */
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({ createdAt: z.string().datetime(), id: z.string() })
          .nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Subquery: active member count per community (avoids hardcoded schema name)
      const memberCountSq = ctx.db
        .select({
          communityId: communityMemberships.communityId,
          count: count().as("member_count"),
        })
        .from(communityMemberships)
        .where(eq(communityMemberships.status, "active"))
        .groupBy(communityMemberships.communityId)
        .as("mc");

      const conditions = [
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
      ];

      if (input.search) {
        conditions.push(ilike(communities.name, `%${escapeLike(input.search)}%`));
      }

      // Keyset pagination: (createdAt, id) descending
      if (input.cursor) {
        conditions.push(
          sql`(${communities.createdAt}, ${communities.id}) < (${input.cursor.createdAt}, ${input.cursor.id})`,
        );
      }

      const items = await ctx.db
        .select({
          id: communities.id,
          name: communities.name,
          slug: communities.slug,
          description: communities.description,
          logoUrl: communities.logoUrl,
          joinPolicy: communities.joinPolicy,
          memberCount: sql<number>`coalesce(${memberCountSq.count}, 0)`,
          createdAt: communities.createdAt,
        })
        .from(communities)
        .leftJoin(memberCountSq, eq(communities.id, memberCountSq.communityId))
        .where(and(...conditions))
        .orderBy(desc(communities.createdAt), desc(communities.id))
        .limit(input.limit + 1);

      let nextCursor: typeof input.cursor | undefined;
      if (items.length > input.limit) {
        const next = items.pop()!;
        nextCursor = { createdAt: next.createdAt.toISOString(), id: next.id };
      }

      return { items, nextCursor };
    }),

  /** Get community by slug (public profile) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const [memberCountResult] = await ctx.db
        .select({ count: count() })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
          ),
        );

      return {
        ...community,
        memberCount: memberCountResult?.count ?? 0,
      };
    }),

  /** Public member list */
  getMembers: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({ joinedAt: z.string().datetime(), userId: z.string() })
          .nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Unlisted communities: only members can view the member list
      if (!community.isListedInDirectory) {
        const userId = ctx.session?.user?.id;
        if (!userId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.userId, userId),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (!membership) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
      }

      const conditions = [
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.status, "active"),
      ];

      // Keyset pagination: (joinedAt, userId) descending
      if (input.cursor) {
        conditions.push(
          sql`(${communityMemberships.joinedAt}, ${communityMemberships.userId}) < (${input.cursor.joinedAt}, ${input.cursor.userId})`,
        );
      }

      const items = await ctx.db
        .select({
          userId: communityMemberships.userId,
          role: communityMemberships.role,
          joinedAt: communityMemberships.joinedAt,
          displayName: memberProfiles.displayName,
          bio: memberProfiles.bio,
          image: user.image,
        })
        .from(communityMemberships)
        .innerJoin(user, eq(communityMemberships.userId, user.id))
        .leftJoin(
          memberProfiles,
          eq(communityMemberships.userId, memberProfiles.userId),
        )
        .where(and(...conditions))
        .orderBy(desc(communityMemberships.joinedAt), desc(communityMemberships.userId))
        .limit(input.limit + 1);

      let nextCursor: typeof input.cursor | undefined;
      if (items.length > input.limit) {
        const next = items.pop()!;
        nextCursor = { joinedAt: next.joinedAt.toISOString(), userId: next.userId };
      }

      return { items, nextCursor };
    }),

  /** Create a new community */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
        joinPolicy: z
          .enum(["open", "invite_only", "approval_required"])
          .default("open"),
        isListedInDirectory: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = generateSlug(input.name);

      // Check slug uniqueness
      const existing = await ctx.db.query.communities.findFirst({
        where: eq(communities.slug, slug),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A community with a similar name already exists",
        });
      }

      const [community] = await ctx.db
        .insert(communities)
        .values({
          name: input.name,
          slug,
          description: input.description,
          joinPolicy: input.joinPolicy,
          isListedInDirectory: input.isListedInDirectory,
          createdBy: ctx.session.user.id,
        })
        .returning();

      // Creator becomes owner
      await ctx.db.insert(communityMemberships).values({
        communityId: community!.id,
        userId: ctx.session.user.id,
        role: "owner",
        status: "active",
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.created",
        targetType: "community",
        targetId: community!.id,
        metadata: { name: input.name, slug },
      });

      return community!;
    }),

  /** Join an open community */
  join: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (community.joinPolicy !== "open") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This community is not open for direct joining",
        });
      }

      // Check existing membership
      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this community" });
        }
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
        }
        // Existing invited/pending_approval → activate instead of duplicate insert
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: community.id,
          userId: ctx.session.user.id,
          role: "member",
          status: "active",
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.joined",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  /** Request to join an approval-required community */
  requestToJoin: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (community.joinPolicy !== "approval_required") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This community does not require approval to join",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this community" });
        }
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
        }
        if (existing.status === "pending_approval") {
          throw new TRPCError({ code: "CONFLICT", message: "Request already pending" });
        }
        if (existing.status === "invited") {
          // Already invited — update to pending_approval since they're requesting via the approval flow
          await ctx.db
            .update(communityMemberships)
            .set({ status: "pending_approval" })
            .where(eq(communityMemberships.id, existing.id));
          return { success: true };
        }
      }

      await ctx.db.insert(communityMemberships).values({
        communityId: community.id,
        userId: ctx.session.user.id,
        role: "member",
        status: "pending_approval",
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.join_requested",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  /** Accept an invite by code */
  acceptInvite: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.query.communityInvites.findFirst({
        where: eq(communityInvites.code, input.code),
        with: { community: true },
      });

      if (!invite || invite.community.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
      }

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }

      // Atomic: increment useCount only if under maxUses (prevents race condition)
      if (invite.maxUses !== null) {
        const [updated] = await ctx.db
          .update(communityInvites)
          .set({ useCount: sql`${communityInvites.useCount} + 1` })
          .where(
            and(
              eq(communityInvites.id, invite.id),
              sql`${communityInvites.useCount} < ${invite.maxUses}`,
            ),
          )
          .returning();

        if (!updated) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has reached max uses" });
        }
      } else {
        // No max — just increment
        await ctx.db
          .update(communityInvites)
          .set({ useCount: sql`${communityInvites.useCount} + 1` })
          .where(eq(communityInvites.id, invite.id));
      }

      // Check existing membership
      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, invite.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      });

      if (existing?.status === "banned") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this community" });
      }

      if (existing?.status === "active") {
        return { success: true, communitySlug: invite.community.slug };
      }

      if (existing) {
        // Update pending/invited to active
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: invite.communityId,
          userId: ctx.session.user.id,
          role: "member",
          status: "active",
          invitedBy: invite.createdBy,
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.joined",
        targetType: "community",
        targetId: invite.communityId,
        metadata: { via: "invite" },
      });

      return { success: true, communitySlug: invite.community.slug };
    }),

  /** Leave a community */
  leave: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not a member" });
      }

      // Prevent last owner from leaving
      if (membership.role === "owner") {
        const [ownerCount] = await ctx.db
          .select({ count: count() })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.role, "owner"),
              eq(communityMemberships.status, "active"),
            ),
          );

        if ((ownerCount?.count ?? 0) <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot leave — you are the last owner. Transfer ownership first.",
          });
        }
      }

      await ctx.db
        .delete(communityMemberships)
        .where(eq(communityMemberships.id, membership.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.left",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  /** List communities the user belongs to */
  getMyCommunities: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        communityId: communityMemberships.communityId,
        role: communityMemberships.role,
        status: communityMemberships.status,
        joinedAt: communityMemberships.joinedAt,
        name: communities.name,
        slug: communities.slug,
        description: communities.description,
        logoUrl: communities.logoUrl,
      })
      .from(communityMemberships)
      .innerJoin(
        communities,
        and(
          eq(communityMemberships.communityId, communities.id),
          isNull(communities.deletedAt),
        ),
      )
      .where(eq(communityMemberships.userId, ctx.session.user.id))
      .orderBy(desc(communityMemberships.joinedAt));

    return memberships;
  }),

  // ─── Admin Procedures ─────────────────────────────────────────────

  /** Update community settings (admin+) */
  updateSettings: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).optional(),
        logoUrl: z.string().url().optional().nullable(),
        joinPolicy: z.enum(["open", "invite_only", "approval_required"]).optional(),
        isListedInDirectory: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Only owner/admin can change settings
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
      if (input.joinPolicy !== undefined) updates.joinPolicy = input.joinPolicy;
      if (input.isListedInDirectory !== undefined) updates.isListedInDirectory = input.isListedInDirectory;

      // Note: slug is NOT auto-updated on name change to avoid breaking
      // existing URLs and bookmarks. Slug is set once at community creation.

      const [updated] = await ctx.db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, ctx.community.id))
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.settings_updated",
        targetType: "community",
        targetId: ctx.community.id,
        metadata: updates,
      });

      return updated!;
    }),

  /** Approve a pending membership request */
  approveRequest: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [updated] = await ctx.db
        .update(communityMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.userId, input.userId),
            eq(communityMemberships.status, "pending_approval"),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending request found" });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.member_approved",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Reject a pending membership request */
  rejectRequest: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const deleted = await ctx.db
        .delete(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.userId, input.userId),
            eq(communityMemberships.status, "pending_approval"),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending request found" });
      }

      return { success: true };
    }),

  /** Change a member's role */
  setMemberRole: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "moderator", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Check hierarchy: actor must outrank target's current AND new role
      if (
        !canManageRole(ctx.communityRole, target.role as CommunityRole) ||
        !canManageRole(ctx.communityRole, input.role)
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      await ctx.db
        .update(communityMemberships)
        .set({ role: input.role })
        .where(eq(communityMemberships.id, target.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.role_changed",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
        metadata: { from: target.role, to: input.role },
      });

      return { success: true };
    }),

  /** Transfer ownership to another active member (owner only) */
  transferOwnership: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can transfer ownership" });
      }

      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot transfer to yourself" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user is not an active member" });
      }

      // Promote target to owner, demote self to admin (atomic via transaction)
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(communityMemberships)
          .set({ role: "owner" })
          .where(eq(communityMemberships.id, target.id));

        await tx
          .update(communityMemberships)
          .set({ role: "admin" })
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.userId, ctx.session.user.id),
            ),
          );
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.ownership_transferred",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Ban a member */
  banMember: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!canManageRole(ctx.communityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db
        .update(communityMemberships)
        .set({ status: "banned" })
        .where(eq(communityMemberships.id, target.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.member_banned",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Remove a member */
  removeMember: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!canManageRole(ctx.communityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db
        .delete(communityMemberships)
        .where(eq(communityMemberships.id, target.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.member_removed",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Create an invite link */
  createInviteLink: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        maxUses: z.number().int().positive().optional(),
        expiresInDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000)
        : null;

      const [invite] = await ctx.db
        .insert(communityInvites)
        .values({
          communityId: ctx.community.id,
          code,
          createdBy: ctx.session.user.id,
          maxUses: input.maxUses ?? null,
          expiresAt,
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.invite_created",
        targetType: "community",
        targetId: ctx.community.id,
      });

      return invite!;
    }),

  /** Revoke an invite link */
  revokeInviteLink: communityProcedure
    .input(z.object({ slug: z.string(), inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const deleted = await ctx.db
        .delete(communityInvites)
        .where(
          and(
            eq(communityInvites.id, input.inviteId),
            eq(communityInvites.communityId, ctx.community.id),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return { success: true };
    }),

  /** Invite a member directly by userId */
  inviteMember: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Check user exists
      const targetUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, input.userId),
      });
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
        ),
      });

      if (existing?.status === "active") {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }

      if (existing?.status === "banned") {
        throw new TRPCError({ code: "FORBIDDEN", message: "User is banned" });
      }

      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({ status: "invited", invitedBy: ctx.session.user.id })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: ctx.community.id,
          userId: input.userId,
          role: "member",
          status: "invited",
          invitedBy: ctx.session.user.id,
        });
      }

      return { success: true };
    }),
});
