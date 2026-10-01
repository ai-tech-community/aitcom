import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  requireHubOperator,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import {
  communities,
  communityMemberships,
  notifications,
} from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import { MAX_PINS } from "@/lib/feed-sort";
import { loadCommunityActivity } from "@/server/communities/activity-feed";
import {
  decorateFeedPosts,
  requireActiveFeedMember,
  requireFeedPoster,
  requireViewablePost,
} from "@/server/communities/feed-posts";
import {
  syncFeedPostCounters,
  toggleFeedPostLike,
} from "@/server/communities/feed-post-counters";
import { VIDEO_VISIBILITIES } from "@/lib/video-rules";
import { getVideoStorage } from "@/server/media/video-storage";
import {
  feedViewerFor,
  isModeratorRole,
  OUTSIDE_VIEWER,
  postVisibilityWhere,
} from "@/server/communities/post-visibility";
import { listReels } from "@/server/communities/reels";
import {
  listPostReports,
  REPORT_REASONS,
  reportPost,
  reviewReport,
} from "@/server/communities/post-reports";
import {
  MAX_IMAGE_ALT_LENGTH,
  MAX_POST_IMAGES,
  claimFeedImages,
  cleanUpPostImages,
} from "@/server/communities/feed-images";

/**
 * The members a post's "@Name" mentions point at, by user id. The server
 * keeps only active members of the community whose name is in the text.
 */
const mentionIds = z.array(z.string().min(1).max(255)).max(MAX_POST_MENTIONS);

/** Pictures as a member attaches them: their uploads and descriptions. */
const imageChoices = z
  .array(
    z.object({
      id: z.number().int().positive(),
      alt: z.string().max(MAX_IMAGE_ALT_LENGTH).default(""),
    }),
  )
  .min(1)
  .max(MAX_POST_IMAGES);
import {
  NO_GIF,
  gifFields,
  lookUpGif,
  loadPostForMediaEdit,
  postDetailsUpdate,
  setPostMedia,
} from "@/server/communities/post-media";
import { resolvePostTopic } from "@/server/communities/post-topics";
import {
  findMentionCandidates,
  resolveMentions,
} from "@/server/communities/post-mentions";
import { MAX_POST_MENTIONS } from "@/lib/post-mentions";
import { getGiphyClient } from "@/server/giphy/giphy";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

/**
 * GIF searches per member: GIPHY's quota is shared by the whole app, so
 * one member paging through results must not use it up for everyone.
 */
const checkGifSearchLimit = createPerUserLimit({
  windowMs: 3_600_000, // 1 hour
  max: 60,
});
import { cleanUpPostVideoFiles } from "@/server/communities/post-video-files";
import {
  finishVideoPost,
  replacePostVideo,
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

/**
 * Where a moderator reviews a reported post: a video opens on its reel, a
 * text post on the community page.
 */
function reportedPostPath(
  communitySlug: string,
  post: { postId: number; isVideo: boolean },
): string {
  return post.isVideo
    ? `/communities/${communitySlug}/reels?v=${post.postId}`
    : `/communities/${communitySlug}`;
}

/** Tells the community's owners, admins and moderators a post was hidden. */
async function notifyPostReported(
  database: Database,
  input: { communityId: string; postId: number; isVideo: boolean },
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
  const path = reportedPostPath(community.slug, input);
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

  // ── getReels ────────────────────────────────────────────────────────────────
  /**
   * A community's videos for Reels mode. Public: signed-out visitors see
   * public, non-hidden videos; members see what the member feed shows. A
   * deep link the viewer may not open comes back as a notice, not a video.
   */
  getReels: publicProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().int().min(1).max(20).default(8),
        cursor: z
          .object({ createdAt: z.string().datetime(), id: z.number().int() })
          .nullish(),
        startAtPostId: z.number().int().positive().nullish(),
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
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });
      const userId = ctx.session?.user?.id ?? null;
      const viewer = userId
        ? feedViewerFor(
            userId,
            await ctx.db.query.communityMemberships.findFirst({
              where: and(
                eq(communityMemberships.communityId, community.id),
                eq(communityMemberships.userId, userId),
                eq(communityMemberships.status, "active"),
              ),
              columns: { role: true },
            }),
          )
        : OUTSIDE_VIEWER;
      return listReels(
        {
          database: ctx.db,
          payload: await getPayloadClient(),
          storage: getVideoStorage,
        },
        {
          community,
          viewer,
          cursor: input.cursor ?? null,
          startAtPostId: input.startAtPostId ?? null,
          limit: input.limit,
        },
      );
    }),

  // ── createPost ──────────────────────────────────────────────────────────────
  createPost: protectedProcedure
    .input(
      z
        .object({
          communitySlug: z.string(),
          content: z.string().min(1).max(POST_MAX_LENGTH),
          /** The member's own feed post images, from `/api/upload`. */
          images: imageChoices.optional(),
          /** A GIF picked from `searchGifs`; a post has pictures or a GIF. */
          gifId: z
            .string()
            .regex(/^[A-Za-z0-9]{1,64}$/)
            .optional(),
          topicSlug: z.string().optional(),
          mentions: mentionIds.optional(),
        })
        .refine((v) => v.images === undefined || v.gifId === undefined, {
          message: "A post has pictures or a GIF, not both.",
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
      const images = input.images
        ? await claimFeedImages(payload, {
            images: input.images,
            userId: ctx.session.user.id,
          })
        : [];
      const gif =
        input.gifId === undefined
          ? null
          : await lookUpGif(getGiphyClient, input.gifId);

      const post = await payload.create({
        collection: "feed-posts",
        data: {
          content: input.content,
          mentions: await resolveMentions(ctx.db, {
            communityId: community.id,
            content: input.content,
            userIds: input.mentions ?? [],
          }),
          images: images.map((image) => image.id),
          ...(gif ? { gif: gifFields(gif) } : {}),
          authorId: ctx.session.user.id,
          authorName: userName,
          communityId: community.id,
          likeCount: 0,
          commentCount: 0,
          topicSlug: await resolvePostTopic(
            payload,
            community.id,
            input.topicSlug,
          ),
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
        caption: z.string().trim().min(1).max(POST_MAX_LENGTH),
        topicSlug: z.string().optional(),
        mentions: mentionIds.optional(),
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
          mentions: await resolveMentions(ctx.db, {
            communityId: community.id,
            content: input.caption,
            userIds: input.mentions ?? [],
          }),
          topicSlug: await resolvePostTopic(
            await getPayloadClient(),
            community.id,
            input.topicSlug,
          ),
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

  // ── searchGifs ──────────────────────────────────────────────────────────────
  /**
   * GIFs for the post editor: trending without a query, otherwise a search
   * in the member's language. Only members who may post can search, since
   * every search counts against the app's GIPHY quota.
   */
  searchGifs: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        query: z.string().max(50).default(""),
        /** The offset of the page, for infinite loading. */
        cursor: z.number().int().min(0).max(4999).nullish(),
        lang: z.enum(["en", "nl"]).default("en"),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireFeedPoster(ctx.db, input.communitySlug, ctx.session.user.id);
      if (!checkGifSearchLimit(ctx.session.user.id).allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "GIF search is busy. Try again in a few minutes.",
        });
      }
      const giphy = getGiphyClient();
      const query = input.query.trim();
      const offset = input.cursor ?? 0;
      const page = query
        ? await giphy.search({ query, offset, lang: input.lang })
        : await giphy.trending({ offset });
      return { gifs: page.gifs, nextCursor: page.nextOffset };
    }),

  // ── mentionCandidates ───────────────────────────────────────────────────────
  /**
   * Members the post editor offers after "@": the community's active
   * members whose name has the typed text, not the caller. Members can
   * see the community's member list already, so this shows nothing new.
   */
  mentionCandidates: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        query: z.string().max(50).default(""),
      }),
    )
    .query(async ({ ctx, input }) => {
      const community = await requireActiveFeedMember(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      return findMentionCandidates(ctx.db, {
        communityId: community.id,
        authorId: ctx.session.user.id,
        query: input.query,
        limit: 8,
      });
    }),

  // ── editPost ────────────────────────────────────────────────────────────────
  /**
   * The author edits a post's text and, optionally, its media: keep it,
   * remove it, or set an image (which replaces a video). Changing media is
   * posting new content, so it needs the same right as posting; the media
   * rules live in `setPostMedia`. Putting a new video on the post is
   * `replacePostVideo`.
   */
  editPost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        communitySlug: z.string(),
        content: z.string().min(1).max(POST_MAX_LENGTH),
        media: z
          .discriminatedUnion("kind", [
            z.object({ kind: z.literal("keep") }),
            z.object({ kind: z.literal("none") }),
            z.object({ kind: z.literal("images"), images: imageChoices }),
            z.object({
              kind: z.literal("gif"),
              giphyId: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
            }),
          ])
          .default({ kind: "keep" }),
        /** Move the post to another of its community's topics. */
        topicSlug: z.string().max(100).optional(),
        /** Take the link preview off the post (true) or put it back. */
        linkPreviewHidden: z.boolean().optional(),
        /**
         * Members the edited text mentions. Mentions already on the post
         * stay while their names are in the text, given here or not.
         */
        mentions: mentionIds.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      // The id only: the stored post carries the video's storage keys.
      if (input.media.kind !== "keep") {
        const community = await requireFeedPoster(
          ctx.db,
          input.communitySlug,
          ctx.session.user.id,
        );
        await setPostMedia(
          {
            payload,
            getStorage: getVideoStorage,
            getGiphy: getGiphyClient,
          },
          {
            postId: input.postId,
            userId: ctx.session.user.id,
            communityId: community.id,
            content: input.content,
            mentions:
              input.mentions === undefined
                ? undefined
                : await resolveMentions(ctx.db, {
                    communityId: community.id,
                    content: input.content,
                    userIds: input.mentions,
                  }),
            media: input.media,
            details: {
              topicSlug:
                input.topicSlug === undefined
                  ? undefined
                  : await resolvePostTopic(
                      payload,
                      community.id,
                      input.topicSlug,
                    ),
              linkPreviewHidden: input.linkPreviewHidden,
            },
          },
        );
        return { id: input.postId };
      }

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
      // Moving a post or hiding its preview changes what the community
      // sees, like media: it needs the right to post, and a post under
      // review stays as it is until a moderator has looked.
      if (
        input.topicSlug !== undefined ||
        input.linkPreviewHidden !== undefined
      ) {
        const community = await requireFeedPoster(
          ctx.db,
          input.communitySlug,
          ctx.session.user.id,
        );
        await loadPostForMediaEdit(payload, {
          postId: post.id,
          userId: ctx.session.user.id,
          communityId: community.id,
        });
      }

      const topicSlug =
        input.topicSlug === undefined || !post.communityId
          ? undefined
          : await resolvePostTopic(payload, post.communityId, input.topicSlug);
      const mentions =
        input.mentions === undefined || !post.communityId
          ? undefined
          : await resolveMentions(ctx.db, {
              communityId: post.communityId,
              content: input.content,
              userIds: input.mentions,
            });
      await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          content: input.content,
          ...(mentions ? { mentions } : {}),
          ...postDetailsUpdate(post, {
            topicSlug,
            linkPreviewHidden: input.linkPreviewHidden,
          }),
          isEdited: true,
          editedAt: new Date().toISOString(),
        },
      });
      return { id: post.id };
    }),

  // ── replacePostVideo ────────────────────────────────────────────────────────
  /**
   * The author puts a newly uploaded video on an existing post (replacing
   * its image or video), with the edited caption. Upload first with
   * `createVideoUpload` for the post's own visibility.
   */
  replacePostVideo: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        communitySlug: z.string(),
        uploadId: z.string().uuid(),
        caption: z.string().trim().min(1).max(POST_MAX_LENGTH),
        durationSeconds: z.number().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        /** Topic and preview changes made in the same edit. */
        topicSlug: z.string().max(100).optional(),
        linkPreviewHidden: z.boolean().optional(),
        /** As in `editPost`. */
        mentions: mentionIds.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      return replacePostVideo(
        { payload: await getPayloadClient(), storage: getVideoStorage() },
        {
          userId: ctx.session.user.id,
          communityId: community.id,
          postId: input.postId,
          uploadId: input.uploadId,
          caption: input.caption,
          mentions:
            input.mentions === undefined
              ? undefined
              : await resolveMentions(ctx.db, {
                  communityId: community.id,
                  content: input.caption,
                  userIds: input.mentions,
                }),
          durationSeconds: input.durationSeconds,
          width: input.width,
          height: input.height,
          details: {
            topicSlug:
              input.topicSlug === undefined
                ? undefined
                : await resolvePostTopic(
                    await getPayloadClient(),
                    community.id,
                    input.topicSlug,
                  ),
            linkPreviewHidden: input.linkPreviewHidden,
          },
        },
      );
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

      await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          isDeleted: true,
          content: "",
          authorName: "",
          images: [],
          image: null,
          imageUrl: null,
          gif: NO_GIF,
        },
      });
      // Best effort: the post is already gone, so a storage failure is logged
      // rather than surfaced.
      await cleanUpPostVideoFiles(getVideoStorage, post, {
        context: "feed.deletePost",
      });
      await cleanUpPostImages(payload, post, [], {
        context: "feed.deletePost",
      });
      // The id only: the stored post carries the video's storage keys.
      return { id: post.id };
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

      // Only an active member who can see the post may like it.
      const { post } = await requireViewablePost(
        ctx.db,
        payload,
        input.postId,
        userId,
        { requireMembership: true },
      );

      const { liked } = await toggleFeedPostLike(payload, input.postId, userId);

      // Award XP to post author (only if author is different from liker)
      if (liked && post.authorId && post.authorId !== userId) {
        await awardXp(ctx.db, post.authorId, XP_AMOUNTS.FEED_RECEIVE_LIKE);
      }

      return { liked };
    }),

  // ── getComments ─────────────────────────────────────────────────────────────
  getComments: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      // A post's comments follow the post's visibility.
      await requireViewablePost(
        ctx.db,
        payload,
        input.postId,
        ctx.session.user.id,
      );

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

      // Only an active member who can see the post may comment on it.
      const { post } = await requireViewablePost(
        ctx.db,
        payload,
        input.postId,
        ctx.session.user.id,
        { requireMembership: true },
      );

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
      await syncFeedPostCounters(payload, input.postId);

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

      // Soft-delete, then resync the parent post's commentCount
      await payload.update({
        collection: "feed-comments",
        id: input.commentId,
        data: { isDeleted: true, content: "", authorName: "" },
      });

      const postId =
        typeof comment.post === "object" ? comment.post.id : comment.post;
      if (postId) await syncFeedPostCounters(payload, postId);

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
      // Moderators first, so no one else can probe whether a post exists.
      if (!viewer.isModerator) throw new TRPCError({ code: "FORBIDDEN" });
      if (post.isDeleted) throw new TRPCError({ code: "NOT_FOUND" });
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
