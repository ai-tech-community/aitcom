import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  requireHubOperator,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import {
  communities,
  communityMemberships,
  notifications,
} from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { MAX_PINS } from "@/lib/feed-sort";
import { loadCommunityActivity } from "@/server/communities/activity-feed";
import {
  decorateFeedPosts,
  requireActiveFeedMember,
  requireFeedPoster,
} from "@/server/communities/feed-posts";
import { VIDEO_VISIBILITIES } from "@/lib/video-rules";
import { isCommunityVideosEnabled } from "@/lib/community-videos-flag";
import { getVideoStorage } from "@/server/media/video-storage";
import {
  feedViewerFor,
  isModeratorRole,
  postVisibilityWhere,
} from "@/server/communities/post-visibility";
import {
  listPostReports,
  REPORT_REASONS,
  reportPost,
  reviewReport,
} from "@/server/communities/post-reports";
import {
  cleanUpDeletedPostVideo,
  finishVideoPost,
  issueVideoUpload,
} from "@/server/communities/video-posts";

type Database = typeof Db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A community post and the caller's active membership in its community, for
 * the reporting and moderation procedures. Only community posts can be
 * reported, so a missing post or a hub-wide one is NOT_FOUND.
 */
async function loadCommunityPostForCaller(
  database: Database,
  payload: Payload,
  postId: number,
  userId: string,
) {
  const post = await payload
    .findByID({ collection: "feed-posts", id: postId, depth: 0 })
    .catch(() => null);
  if (!post?.communityId) throw new TRPCError({ code: "NOT_FOUND" });
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, post.communityId),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  return { post, viewer: feedViewerFor(userId, membership) };
}

/** Tells the community's owners, admins and moderators a post was hidden. */
async function notifyPostReported(
  database: Database,
  input: { communityId: string; postId: number },
) {
  const community = await database.query.communities.findFirst({
    where: eq(communities.id, input.communityId),
    columns: { slug: true, name: true },
  });
  if (!community) return;
  const moderators = await database
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, input.communityId),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, ["owner", "admin", "moderator"]),
      ),
    );
  if (moderators.length === 0) return;
  const path = `/communities/${community.slug}`;
  await database.insert(notifications).values(
    moderators.map(({ userId }) => ({
      userId,
      type: "post_reported",
      title: "A post was reported",
      content: `A post in **${community.name}** was reported and is hidden until you review it. [Review it](${path}).`,
      communityId: input.communityId,
      metadata: { postId: input.postId, path },
    })),
  );
}

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
      const community = await requireActiveFeedMember(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      const payload = await getPayloadClient();

      const whereClause: Record<string, unknown> = {
        and: [
          { communityId: { equals: community.id } },
          { isDeleted: { not_equals: true } },
          postVisibilityWhere({
            userId: ctx.session.user.id,
            isMember: true,
            isModerator: isModeratorRole(community.role),
          }),
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
      const page = hasMore ? docs.slice(0, input.limit) : docs;
      const posts = await decorateFeedPosts(
        ctx.db,
        payload,
        page,
        ctx.session.user.id,
        getVideoStorage,
      );
      const last = page.at(-1);
      const nextCursor =
        hasMore && last
          ? { createdAt: last.createdAt, id: last.id }
          : undefined;
      return { posts, nextCursor };
    }),

  // ── getActivity ─────────────────────────────────────────────────────────────
  /**
   * The community Overview: posts, forum threads, ideas, events, and joins
   * in one time-ordered stream, read from the content tables themselves.
   * Pinned posts ride on the first page. Members only, like getFeed.
   */
  getActivity: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(30).default(15),
        cursor: z.object({ at: z.string(), key: z.string() }).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const community = await requireActiveFeedMember(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      return loadCommunityActivity({
        database: ctx.db,
        payload: await getPayloadClient(),
        community,
        viewerId: ctx.session.user.id,
        viewer: {
          userId: ctx.session.user.id,
          isMember: true,
          isModerator: isModeratorRole(community.role),
        },
        storage: getVideoStorage,
        cursor: input.cursor ?? null,
        limit: input.limit,
      });
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
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );

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
          visibility: "community",
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

  // ── createVideoUpload ───────────────────────────────────────────────────────
  createVideoUpload: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        visibility: z.enum(VIDEO_VISIBILITIES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isCommunityVideosEnabled()) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      return issueVideoUpload(
        { payload: await getPayloadClient(), storage: getVideoStorage() },
        {
          userId: ctx.session.user.id,
          communityId: community.id,
          visibility: input.visibility,
        },
      );
    }),

  // ── finishVideoPost ─────────────────────────────────────────────────────────
  finishVideoPost: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        uploadId: z.string().uuid(),
        caption: z.string().trim().min(1).max(2000),
        topicSlug: z.string().optional(),
        durationSeconds: z.number().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      const post = await finishVideoPost(
        { payload: await getPayloadClient(), storage: getVideoStorage() },
        {
          userId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? "member",
          communityId: community.id,
          uploadId: input.uploadId,
          caption: input.caption,
          topicSlug: input.topicSlug ?? "general",
          durationSeconds: input.durationSeconds,
          width: input.width,
          height: input.height,
        },
      );
      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FEED_POST_CREATE);
      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "feed.post_created",
        targetType: "feed-posts",
        targetId: String(post.id),
        communityId: community.id,
        metadata: { communityId: community.id, video: true },
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

      const deleted = await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          isDeleted: true,
          content: "",
          authorName: "",
          imageUrl: null,
        },
      });
      // Best effort: the post is already gone, so a storage failure is logged
      // rather than surfaced.
      await cleanUpDeletedPostVideo(getVideoStorage, post);
      return deleted;
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
      } else {
        // Hub-wide post (communityId null): pinning is a platform-level action,
        // restricted to a root-Hub operator — never any signed-in member.
        await requireHubOperator({ db: ctx.db, session: ctx.session });
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

  // ── reportPost ──────────────────────────────────────────────────────────────
  reportPost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        reason: z.enum(REPORT_REASONS),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const { viewer } = await loadCommunityPostForCaller(
        ctx.db,
        payload,
        input.postId,
        ctx.session.user.id,
      );
      return reportPost(
        {
          payload,
          storage: getVideoStorage,
          notifyModerators: (args) => notifyPostReported(ctx.db, args),
        },
        {
          postId: input.postId,
          reporterId: ctx.session.user.id,
          reason: input.reason,
          note: input.note ?? "",
          viewer,
        },
      );
    }),

  // ── getPostReports ──────────────────────────────────────────────────────────
  /** Why a hidden post was reported, for the community's moderators only. */
  getPostReports: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const { post, viewer } = await loadCommunityPostForCaller(
        ctx.db,
        payload,
        input.postId,
        ctx.session.user.id,
      );
      if (post.isDeleted) throw new TRPCError({ code: "NOT_FOUND" });
      if (!viewer.isModerator) throw new TRPCError({ code: "FORBIDDEN" });
      return listPostReports(payload, post.id);
    }),

  // ── reviewReport ────────────────────────────────────────────────────────────
  reviewReport: protectedProcedure
    .input(
      z.object({ postId: z.number(), action: z.enum(["restore", "remove"]) }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const { viewer } = await loadCommunityPostForCaller(
        ctx.db,
        payload,
        input.postId,
        ctx.session.user.id,
      );
      if (!viewer.isModerator) throw new TRPCError({ code: "FORBIDDEN" });
      await reviewReport(
        {
          payload,
          storage: getVideoStorage,
          notifyModerators: async () => undefined,
        },
        input,
      );
      return { ok: true };
    }),
});
