// src/server/api/routers/agent-feed.ts
//
// Feed procedures for the Agent API (v0.4.0).
// Exported as a plain object to be spread into the main agent router.

import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { agentProcedure, requireScope, requireOwner } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  agentDrafts,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Require the owner to be an active member. Returns the membership row. */
async function requireActiveMembership(
  db: Parameters<typeof logActivity>[0],
  communityId: string,
  ownerId: string,
) {
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, ownerId),
      eq(communityMemberships.status, "active"),
    ),
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Owner is not a member",
    });
  }
  return membership;
}

// ── Procedures ───────────────────────────────────────────────────────────────

export const agentFeedRouter = {
  // ═══════════════════════════════════════════════════════════════════════════
  // READ PROCEDURES (scope: "read")
  // ═══════════════════════════════════════════════════════════════════════════

  /** Browse community feed posts (newest first, keyset pagination). */
  browseFeed: agentProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string(), id: z.number() }).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const community = await resolveCommunity(ctx.db, input.communitySlug);
      const payload = await getPayloadClient();

      const whereClause: Record<string, unknown> = {
        and: [
          { communityId: { equals: community.id } },
          { isDeleted: { not_equals: true } },
        ],
      };

      if (input.cursor) {
        (whereClause.and as unknown[]).push({
          or: [
            { createdAt: { less_than: input.cursor.createdAt } },
            {
              and: [
                { createdAt: { equals: input.cursor.createdAt } },
                { id: { less_than: input.cursor.id } },
              ],
            },
          ],
        });
      }

      const { docs } = await payload.find({
        collection: "feed-posts",
        where: whereClause as Parameters<typeof payload.find>[0]["where"],
        sort: "-createdAt",
        limit: input.limit + 1,
        depth: 0,
      });

      const hasMore = docs.length > input.limit;
      const posts = hasMore ? docs.slice(0, input.limit) : docs;

      const nextCursor =
        hasMore && posts.length > 0
          ? {
              createdAt: posts[posts.length - 1]!.createdAt,
              id: posts[posts.length - 1]!.id,
            }
          : undefined;

      return {
        posts: posts.map((p) => ({
          id: p.id,
          content: p.content ?? "",
          imageUrl: p.imageUrl ?? null,
          authorId: p.authorId ?? null,
          authorName: p.authorName ?? null,
          likeCount: p.likeCount ?? 0,
          commentCount: p.commentCount ?? 0,
          createdAt: p.createdAt,
        })),
        nextCursor,
      };
    }),

  /** Get comments on a feed post. */
  getFeedComments: agentProcedure
    .input(
      z.object({
        postId: z.number(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "feed-comments",
        where: {
          and: [
            { post: { equals: input.postId } },
            { isDeleted: { not_equals: true } },
          ],
        },
        sort: "createdAt",
        limit: input.limit,
        depth: 0,
      });

      return docs.map((c) => ({
        id: c.id,
        content: c.content ?? "",
        authorId: c.authorId ?? null,
        authorName: c.authorName ?? null,
        createdAt: c.createdAt,
      }));
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE PROCEDURES (scope: "contribute")
  // ═══════════════════════════════════════════════════════════════════════════

  /** Post to community feed. Respects feedPostPolicy. Ghost mode -> draft. */
  createFeedPost: agentProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        content: z.string().min(1).max(2000),
        imageUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const community = await resolveCommunity(ctx.db, input.communitySlug);
      const membership = await requireActiveMembership(
        ctx.db,
        community.id,
        ownerId,
      );

      // Enforce feed post policy
      if (
        community.feedPostPolicy === "admins_only" &&
        !["owner", "admin", "moderator"].includes(membership.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins and moderators can post",
        });
      }

      // ADR-0015: human community surfaces are never agent-authored. Always draft — never auto-post here.
      const [draft] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "feed_post",
          targetType: "community",
          targetId: community.id,
          content: input.content,
          metadata: {
            communitySlug: input.communitySlug,
            imageUrl: input.imageUrl,
          },
        })
        .returning();

      return { mode: "draft" as const, draftId: draft!.id };
    }),

  /** Comment on a feed post. Ghost mode -> draft. */
  commentOnFeedPost: agentProcedure
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const payload = await getPayloadClient();

      // Verify the post exists and is not deleted
      let post;
      try {
        post = await payload.findByID({
          collection: "feed-posts",
          id: input.postId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      // Verify owner is an active member of the post's community
      await requireActiveMembership(ctx.db, post.communityId ?? "", ownerId);

      // ADR-0015: human community surfaces are never agent-authored. Always draft — never auto-post here.
      const [draft] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "feed_comment",
          targetType: "feed-posts",
          targetId: String(input.postId),
          content: input.content,
          metadata: { postId: input.postId },
        })
        .returning();

      return { mode: "draft" as const, draftId: draft!.id };
    }),

  /** Like/unlike a feed post. Executes directly even in ghost mode (low risk). */
  toggleFeedLike: agentProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const payload = await getPayloadClient();

      // Verify the post exists and is not deleted
      let post;
      try {
        post = await payload.findByID({
          collection: "feed-posts",
          id: input.postId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      // Verify owner is an active member of the post's community
      await requireActiveMembership(ctx.db, post.communityId ?? "", ownerId);

      // Check for existing like
      const { docs: existingLikes } = await payload.find({
        collection: "feed-likes",
        where: {
          and: [
            { post: { equals: input.postId } },
            { userId: { equals: ownerId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (existingLikes.length > 0) {
        // Unlike: remove existing like
        await payload.delete({
          collection: "feed-likes",
          id: existingLikes[0]!.id,
        });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: Math.max(0, (post.likeCount ?? 0) - 1) },
        });

        return { liked: false };
      } else {
        // Like: create new like
        await payload.create({
          collection: "feed-likes",
          data: { post: input.postId, userId: ownerId },
        });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: (post.likeCount ?? 0) + 1 },
        });

        await logActivity(ctx.db, {
          actorId: ctx.agent.agentId,
          actorType: "agent",
          action: "feed.post_liked",
          targetType: "feed-posts",
          targetId: String(input.postId),
          metadata: { onBehalfOf: ownerId },
        });

        return { liked: true };
      }
    }),
};
