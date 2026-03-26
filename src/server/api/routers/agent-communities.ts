// src/server/api/routers/agent-communities.ts
//
// Community procedures for the Agent API (v0.4.0).
// Exported as a plain object to be spread into the main agent router.

import { z } from "zod";
import { and, eq, isNull, ilike, sql, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { agentProcedure, requireScope } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityInvites,
  agentSuggestions,
} from "@/server/db/schema";
import { generateSlug } from "@/server/communities/slug-utils";
import { canManageRole, type CommunityRole } from "@/server/communities/role-utils";
import { logActivity } from "@/server/agent/activity";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escape SQL LIKE/ILIKE pattern characters */
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

/** Resolve a community by slug (non-deleted). Throws NOT_FOUND. */
async function resolveCommunity(
  db: Parameters<typeof logActivity>[0],
  slug: string,
) {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
  });
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
  }
  return community;
}

/** Resolve the owner's active membership in a community. Returns null if none. */
async function resolveOwnerMembership(
  db: Parameters<typeof logActivity>[0],
  communityId: string,
  ownerId: string,
) {
  return db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, ownerId),
      eq(communityMemberships.status, "active"),
    ),
  });
}

/**
 * Require the owner to be an admin+ of the community.
 * Returns the membership row for further checks.
 */
async function requireAdmin(
  db: Parameters<typeof logActivity>[0],
  communityId: string,
  ownerId: string,
) {
  const membership = await resolveOwnerMembership(db, communityId, ownerId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this community" });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requires admin or owner role" });
  }
  return membership;
}

// ── Procedures ───────────────────────────────────────────────────────────────

export const agentCommunityRouter = {
  // ═══════════════════════════════════════════════════════════════════════════
  // READ PROCEDURES (scope: "read")
  // ═══════════════════════════════════════════════════════════════════════════

  /** Browse public (listed) communities with member counts. */
  browseCommunities: agentProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

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
        conditions.push(
          ilike(communities.name, `%${escapeLike(input.search)}%`),
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
        .limit(input.limit);

      return items;
    }),

  /** Get community details + the owner's membership/role. */
  getCommunityInfo: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const community = await resolveCommunity(ctx.db, input.slug);

      const [memberCountResult] = await ctx.db
        .select({ count: count() })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
          ),
        );

      // Fetch the owner's membership (if any)
      const ownerMembership =
        await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.userId, ctx.agent.ownerId),
          ),
        });

      return {
        ...community,
        memberCount: memberCountResult?.count ?? 0,
        ownerMembership: ownerMembership
          ? {
              role: ownerMembership.role,
              status: ownerMembership.status,
              joinedAt: ownerMembership.joinedAt,
            }
          : null,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMBERSHIP PROCEDURES (scope: "contribute")
  // ═══════════════════════════════════════════════════════════════════════════

  /** Join an open community on behalf of the owner. */
  joinCommunity: agentProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);

      if (community.joinPolicy !== "open") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This community is not open for direct joining",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Owner is banned from this community",
          });
        }
        if (existing.status === "active") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Already a member",
          });
        }
        // Existing invited/pending_approval -> activate
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: community.id,
          userId: ctx.agent.ownerId,
          role: "member",
          status: "active",
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.joined",
        targetType: "community",
        targetId: community.id,
        metadata: { onBehalfOf: ctx.agent.ownerId },
      });

      return { success: true };
    }),

  /** Request to join an approval-required community on behalf of the owner. */
  requestToJoinCommunity: agentProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);

      if (community.joinPolicy !== "approval_required") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This community does not require approval to join",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Owner is banned from this community",
          });
        }
        if (existing.status === "active") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Already a member",
          });
        }
        if (existing.status === "pending_approval") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Request already pending",
          });
        }
        if (existing.status === "invited") {
          await ctx.db
            .update(communityMemberships)
            .set({ status: "pending_approval" })
            .where(eq(communityMemberships.id, existing.id));

          await logActivity(ctx.db, {
            actorId: ctx.agent.agentId,
            actorType: "agent",
            action: "community.join_requested",
            targetType: "community",
            targetId: community.id,
            metadata: { from: "invited", onBehalfOf: ctx.agent.ownerId },
          });

          return { success: true };
        }
      }

      await ctx.db.insert(communityMemberships).values({
        communityId: community.id,
        userId: ctx.agent.ownerId,
        role: "member",
        status: "pending_approval",
      });

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.join_requested",
        targetType: "community",
        targetId: community.id,
        metadata: { onBehalfOf: ctx.agent.ownerId },
      });

      return { success: true };
    }),

  /** Leave a community on behalf of the owner. */
  leaveCommunity: agentProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);

      const membership = await resolveOwnerMembership(
        ctx.db,
        community.id,
        ctx.agent.ownerId,
      );

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Not a member",
        });
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
            message:
              "Cannot leave — owner is the last owner. Transfer ownership first.",
          });
        }
      }

      await ctx.db
        .delete(communityMemberships)
        .where(eq(communityMemberships.id, membership.id));

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.left",
        targetType: "community",
        targetId: community.id,
        metadata: { onBehalfOf: ctx.agent.ownerId },
      });

      return { success: true };
    }),

  /** List communities the owner belongs to. */
  getOwnerCommunities: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "contribute");

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
      .where(eq(communityMemberships.userId, ctx.agent.ownerId))
      .orderBy(desc(communityMemberships.joinedAt));

    return memberships;
  }),

  /** Accept an invite link on behalf of the owner. */
  acceptCommunityInvite: agentProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const invite = await ctx.db.query.communityInvites.findFirst({
        where: eq(communityInvites.code, input.code),
        with: { community: true },
      });

      if (!invite || invite.community.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invite",
        });
      }

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invite has expired",
        });
      }

      // Check existing membership BEFORE consuming invite use
      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, invite.communityId),
          eq(communityMemberships.userId, ctx.agent.ownerId),
        ),
      });

      if (existing?.status === "banned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner is banned from this community",
        });
      }

      // Atomic: increment useCount only if under maxUses
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
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invite has reached max uses",
          });
        }
      } else {
        await ctx.db
          .update(communityInvites)
          .set({ useCount: sql`${communityInvites.useCount} + 1` })
          .where(eq(communityInvites.id, invite.id));
      }

      if (existing?.status === "active") {
        return { success: true, communitySlug: invite.community.slug };
      }

      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: invite.communityId,
          userId: ctx.agent.ownerId,
          role: "member",
          status: "active",
          invitedBy: invite.createdBy,
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.joined",
        targetType: "community",
        targetId: invite.communityId,
        metadata: { via: "invite", onBehalfOf: ctx.agent.ownerId },
      });

      return { success: true, communitySlug: invite.community.slug };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNITY CREATION (scope: "contribute")
  // ═══════════════════════════════════════════════════════════════════════════

  /** Create a new community on behalf of the owner. */
  createCommunity: agentProcedure
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
      requireScope(ctx.agent.scopes, "contribute");

      const slug = generateSlug(input.name);

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
          createdBy: ctx.agent.ownerId,
        })
        .returning();

      // Owner becomes community owner
      await ctx.db.insert(communityMemberships).values({
        communityId: community!.id,
        userId: ctx.agent.ownerId,
        role: "owner",
        status: "active",
      });

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.created",
        targetType: "community",
        targetId: community!.id,
        metadata: { name: input.name, slug, onBehalfOf: ctx.agent.ownerId },
      });

      return community!;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN PROCEDURES (scope: "contribute", require owner/admin role)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Update community settings (admin+ only). */
  updateCommunitySettings: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).optional(),
        logoUrl: z.string().url().optional().nullable(),
        joinPolicy: z
          .enum(["open", "invite_only", "approval_required"])
          .optional(),
        isListedInDirectory: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      await requireAdmin(ctx.db, community.id, ctx.agent.ownerId);

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined)
        updates.description = input.description;
      if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
      if (input.joinPolicy !== undefined)
        updates.joinPolicy = input.joinPolicy;
      if (input.isListedInDirectory !== undefined)
        updates.isListedInDirectory = input.isListedInDirectory;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No settings to update",
        });
      }

      const [updated] = await ctx.db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, community.id))
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.settings_updated",
        targetType: "community",
        targetId: community.id,
        metadata: updates,
      });

      return updated!;
    }),

  /** Create an invite link (admin+ only). */
  createCommunityInviteLink: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        maxUses: z.number().int().positive().optional(),
        expiresInDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      await requireAdmin(ctx.db, community.id, ctx.agent.ownerId);

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000)
        : null;

      const [invite] = await ctx.db
        .insert(communityInvites)
        .values({
          communityId: community.id,
          code,
          createdBy: ctx.agent.ownerId,
          maxUses: input.maxUses ?? null,
          expiresAt,
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.invite_created",
        targetType: "community",
        targetId: community.id,
      });

      return invite!;
    }),

  /** Revoke an invite link (admin+ only). */
  revokeCommunityInviteLink: agentProcedure
    .input(z.object({ slug: z.string(), inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      await requireAdmin(ctx.db, community.id, ctx.agent.ownerId);

      const deleted = await ctx.db
        .delete(communityInvites)
        .where(
          and(
            eq(communityInvites.id, input.inviteId),
            eq(communityInvites.communityId, community.id),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return { success: true };
    }),

  /** List active invite links for a community (admin+ only). */
  getCommunityInviteLinks: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      await requireAdmin(ctx.db, community.id, ctx.agent.ownerId);

      const invites = await ctx.db
        .select()
        .from(communityInvites)
        .where(eq(communityInvites.communityId, community.id))
        .orderBy(desc(communityInvites.createdAt));

      return invites;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // DESTRUCTIVE ADMIN SUGGESTIONS (ghost mode, scope: "contribute")
  //
  // These do NOT execute the action directly. Instead, they insert a
  // suggestion into `agentSuggestions` for the owner to review.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Suggest banning a member (saved for owner review). */
  suggestBanMember: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        reason: z.string().max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      const membership = await requireAdmin(
        ctx.db,
        community.id,
        ctx.agent.ownerId,
      );

      // Verify target exists and actor can manage them
      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found in community" });
      }

      if (!canManageRole(membership.role as CommunityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to ban this user" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Ban member from ${community.name}`,
          content: input.reason,
          metadata: {
            action: "ban_member",
            communitySlug: community.slug,
            communityId: community.id,
            targetUserId: input.userId,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: {
          action: "ban_member",
          communitySlug: community.slug,
          targetUserId: input.userId,
        },
      });

      return { suggestionId: suggestion!.id };
    }),

  /** Suggest removing a member (saved for owner review). */
  suggestRemoveMember: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        reason: z.string().max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      const membership = await requireAdmin(
        ctx.db,
        community.id,
        ctx.agent.ownerId,
      );

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found in community" });
      }

      if (!canManageRole(membership.role as CommunityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to remove this user" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Remove member from ${community.name}`,
          content: input.reason,
          metadata: {
            action: "remove_member",
            communitySlug: community.slug,
            communityId: community.id,
            targetUserId: input.userId,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: {
          action: "remove_member",
          communitySlug: community.slug,
          targetUserId: input.userId,
        },
      });

      return { suggestionId: suggestion!.id };
    }),

  /** Suggest transferring ownership (saved for owner review). */
  suggestTransferOwnership: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        reason: z.string().max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);

      // Only an owner can have transfer suggested on their behalf
      const membership = await resolveOwnerMembership(
        ctx.db,
        community.id,
        ctx.agent.ownerId,
      );
      if (!membership || membership.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can transfer ownership",
        });
      }

      // Verify target is an active member
      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target user is not an active member",
        });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Transfer ownership of ${community.name}`,
          content: input.reason,
          metadata: {
            action: "transfer_ownership",
            communitySlug: community.slug,
            communityId: community.id,
            targetUserId: input.userId,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: {
          action: "transfer_ownership",
          communitySlug: community.slug,
          targetUserId: input.userId,
        },
      });

      return { suggestionId: suggestion!.id };
    }),

  /** Suggest changing a member's role (saved for owner review). */
  suggestSetMemberRole: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "moderator", "member"]),
        reason: z.string().max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await resolveCommunity(ctx.db, input.slug);
      const membership = await requireAdmin(
        ctx.db,
        community.id,
        ctx.agent.ownerId,
      );

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found in community" });
      }

      // Verify hierarchy: actor must outrank target's current AND desired role
      if (
        !canManageRole(membership.role as CommunityRole, target.role as CommunityRole) ||
        !canManageRole(membership.role as CommunityRole, input.role)
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Change role to ${input.role} in ${community.name}`,
          content: input.reason,
          metadata: {
            action: "set_member_role",
            communitySlug: community.slug,
            communityId: community.id,
            targetUserId: input.userId,
            role: input.role,
            fromRole: target.role,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: {
          action: "set_member_role",
          communitySlug: community.slug,
          targetUserId: input.userId,
          role: input.role,
        },
      });

      return { suggestionId: suggestion!.id };
    }),
};
