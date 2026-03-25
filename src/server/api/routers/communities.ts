// src/server/api/routers/communities.ts
import { z } from "zod";
import { and, eq, gt, isNull, ilike, sql, desc, count } from "drizzle-orm";
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
});
