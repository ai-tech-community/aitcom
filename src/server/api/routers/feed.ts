import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { communities, communityMemberships, user } from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { MAX_PINS } from "@/lib/feed-sort";

export const feedRouter = createTRPCRouter({
  // ── getFeed ─────────────────────────────────────────────────────────────────
  getFeed: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string(), id: z.number() }).optional(),
        topicSlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be a community member to view the feed",
        });
      }

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

      if (input.topicSlug && input.topicSlug !== "all") {
        (whereClause.and as unknown[]).push({
          topicSlug: { equals: input.topicSlug },
        });
      }

      const { docs } = await payload.find({
        collection: "feed-posts",
        where: whereClause as Parameters<typeof payload.find>[0]["where"],
        // Pinned-first only on the unfiltered first page: the keyset cursor
        // compares (createdAt,id) only, so mixing -isPinned into paginated
        // sorts would duplicate old-but-pinned posts across "load more".
        sort:
          (!input.topicSlug || input.topicSlug === "all") && !input.cursor
            ? "-isPinned,-createdAt"
            : "-createdAt",
        limit: input.limit + 1,
        depth: 0,
      });

      const hasMore = docs.length > input.limit;
      const posts = hasMore ? docs.slice(0, input.limit) : docs;

      // Fetch author images
      const authorIds = [
        ...new Set(posts.map((p) => p.authorId).filter(Boolean)),
      ] as string[];
      const authorImageMap = new Map<string, string | null>();
      if (authorIds.length > 0) {
        const authors = await ctx.db
          .select({ id: user.id, image: user.image })
          .from(user)
          .where(inArray(user.id, authorIds));
        for (const a of authors) {
          authorImageMap.set(a.id, a.image);
        }
      }

      const userId = ctx.session?.user?.id;

      if (userId && posts.length > 0) {
        const postIds = posts.map((p) => p.id);
        const { docs: myLikes } = await payload.find({
          collection: "feed-likes",
          where: {
            and: [{ userId: { equals: userId } }, { post: { in: postIds } }],
          },
          limit: postIds.length,
          depth: 0,
        });
        const likedPostIds = new Set(
          myLikes.map((l) =>
            typeof l.post === "object" ? (l.post as { id: number }).id : l.post,
          ),
        );
        const postsWithLike = posts.map((p) => ({
          ...p,
          authorImage: authorImageMap.get(p.authorId) ?? null,
          hasLiked: likedPostIds.has(p.id),
        }));
        const nextCursor =
          hasMore && posts.length > 0
            ? {
                createdAt: posts[posts.length - 1]!.createdAt,
                id: posts[posts.length - 1]!.id,
              }
            : undefined;
        return { posts: postsWithLike, nextCursor };
      }

      const postsWithLike = posts.map((p) => ({
        ...p,
        authorImage: authorImageMap.get(p.authorId) ?? null,
        hasLiked: false,
      }));
      const nextCursor =
        hasMore && posts.length > 0
          ? {
              createdAt: posts[posts.length - 1]!.createdAt,
              id: posts[posts.length - 1]!.id,
            }
          : undefined;
      return { posts: postsWithLike, nextCursor };
    }),

  // ── createPost ──────────────────────────────────────────────────────────────
  createPost: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        content: z.string().min(1).max(2000),
        imageUrl: z.string().url().optional(),
        topicSlug: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Enforce feed post policy
      const feedPolicy =
        (community as unknown as { feedPostPolicy?: string }).feedPostPolicy ??
        "all_members";
      if (feedPolicy === "admins_only") {
        const isPrivileged =
          membership.role === "owner" ||
          membership.role === "admin" ||
          membership.role === "moderator";
        if (!isPrivileged) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      const post = await payload.create({
        collection: "feed-posts",
        data: {
          content: input.content,
          imageUrl: input.imageUrl ?? undefined,
          authorId: ctx.session.user.id,
          authorName: userName,
          communityId: community.id,
          likeCount: 0,
          commentCount: 0,
          topicSlug: input.topicSlug ?? "general",
        },
      });

      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FEED_POST_CREATE);

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "feed.post_created",
        targetType: "feed-posts",
        targetId: String(post.id),
        communityId: community.id,
        metadata: { communityId: community.id },
      });

      return post;
    }),

  // ── editPost ────────────────────────────────────────────────────────────────
  editPost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (post.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          content: input.content,
          isEdited: true,
          editedAt: new Date().toISOString(),
        },
      });
    }),

  // ── deletePost ──────────────────────────────────────────────────────────────
  deletePost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const isAuthor = post.authorId === ctx.session.user.id;
      let canDelete = isAuthor;

      if (!canDelete && post.communityId) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, post.communityId),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (
          membership &&
          (membership.role === "owner" ||
            membership.role === "admin" ||
            membership.role === "moderator")
        ) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          isDeleted: true,
          content: "",
          authorName: "",
          imageUrl: null,
        },
      });
    }),

  // ── pinPost ─────────────────────────────────────────────────────────────────
  pinPost: protectedProcedure
    .input(z.object({ postId: z.number(), isPinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });
      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (post.communityId) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, post.communityId),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (
          !membership ||
          (membership.role !== "owner" &&
            membership.role !== "admin" &&
            membership.role !== "moderator")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only moderators can pin posts",
          });
        }
      }

      if (input.isPinned) {
        const { totalDocs } = await payload.find({
          collection: "feed-posts",
          where: {
            and: [
              { communityId: { equals: post.communityId } },
              { isPinned: { equals: true } },
              { isDeleted: { not_equals: true } },
            ],
          },
          limit: 0,
          depth: 0,
        });
        if (totalDocs >= MAX_PINS) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PIN_CAP_REACHED",
          });
        }
      }

      await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: { isPinned: input.isPinned },
      });
      return { ok: true };
    }),

  // ── toggleLike ──────────────────────────────────────────────────────────────
  toggleLike: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, post.communityId ?? ""),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { docs: existingLikes } = await payload.find({
        collection: "feed-likes",
        where: {
          and: [
            { post: { equals: input.postId } },
            { userId: { equals: userId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (existingLikes.length > 0) {
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
        await payload.create({
          collection: "feed-likes",
          data: { post: input.postId, userId },
        });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: (post.likeCount ?? 0) + 1 },
        });

        // Award XP to post author (only if author is different from liker)
        if (post.authorId && post.authorId !== userId) {
          await awardXp(ctx.db, post.authorId, XP_AMOUNTS.FEED_RECEIVE_LIKE);
        }

        return { liked: true };
      }
    }),

  // ── getComments ─────────────────────────────────────────────────────────────
  getComments: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
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

      return docs;
    }),

  // ── addComment ──────────────────────────────────────────────────────────────
  addComment: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const post = await payload.findByID({
        collection: "feed-posts",
        id: input.postId,
        depth: 0,
      });

      if (!post || post.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Verify active membership
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, post.communityId ?? ""),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const userName = ctx.session.user.name ?? "member";

      const comment = await payload.create({
        collection: "feed-comments",
        data: {
          post: input.postId,
          content: input.content,
          authorId: ctx.session.user.id,
          authorName: userName,
          communityId: post.communityId,
        },
      });

      // Award XP: commenter gets FEED_COMMENT_CREATE, post author gets FEED_RECEIVE_COMMENT
      await awardXp(
        ctx.db,
        ctx.session.user.id,
        XP_AMOUNTS.FEED_COMMENT_CREATE,
      );
      if (post.authorId && post.authorId !== ctx.session.user.id) {
        await awardXp(ctx.db, post.authorId, XP_AMOUNTS.FEED_RECEIVE_COMMENT);
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "feed.comment_created",
        targetType: "feed-comments",
        targetId: String(comment.id),
        communityId: post.communityId ?? undefined,
        recipientId: post.authorId ?? undefined,
        metadata: { postId: input.postId },
      });

      return comment;
    }),

  // ── editComment ─────────────────────────────────────────────────────────────
  editComment: protectedProcedure
    .input(
      z.object({
        commentId: z.number(),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const comment = await payload.findByID({
        collection: "feed-comments",
        id: input.commentId,
        depth: 0,
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (comment.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return payload.update({
        collection: "feed-comments",
        id: input.commentId,
        data: {
          content: input.content,
          isEdited: true,
          editedAt: new Date().toISOString(),
        },
      });
    }),

  // ── deleteComment ───────────────────────────────────────────────────────────
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const comment = await payload.findByID({
        collection: "feed-comments",
        id: input.commentId,
        depth: 0,
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const isAuthor = comment.authorId === ctx.session.user.id;
      let canDelete = isAuthor;

      if (!canDelete && comment.communityId) {
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, comment.communityId),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (
          membership &&
          (membership.role === "owner" ||
            membership.role === "admin" ||
            membership.role === "moderator")
        ) {
          canDelete = true;
        }
      }

      if (!canDelete) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Soft-delete and decrement parent post commentCount
      await payload.update({
        collection: "feed-comments",
        id: input.commentId,
        data: { isDeleted: true, content: "", authorName: "" },
      });

      const postId =
        typeof comment.post === "object" ? comment.post.id : comment.post;
      if (postId) {
        const post = await payload.findByID({
          collection: "feed-posts",
          id: postId,
          depth: 0,
        });
        await payload.update({
          collection: "feed-posts",
          id: postId,
          data: { commentCount: Math.max(0, (post.commentCount ?? 0) - 1) },
        });
      }

      return { deleted: true };
    }),
});
