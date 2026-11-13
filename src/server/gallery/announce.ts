import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { ValidationError } from "payload";

import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import type { GalleryBatch } from "@/payload-types";
import { logActivity } from "@/server/agent/activity";
import { activeCommunityRole } from "@/server/communities/content-visibility-queries";
import {
  canPostToFeed,
  type FeedMemberRole,
} from "@/server/communities/feed-posts";
import {
  DEFAULT_TOPIC,
  resolvePostTopic,
} from "@/server/communities/post-topics";
import { communities, user } from "@/server/db/schema";

import type { GalleryDeps, Payload } from "./deps";
import type { AnnounceBatch } from "./uploads";

type AnnounceDeps = Pick<GalleryDeps, "payload" | "db" | "log">;

/**
 * The feed announcement of a finished gallery batch (spec 2026-11-13, Feed
 * post (collage)): the `AnnounceBatch` that `closeBatch` runs for the call
 * that finished the batch, from the uploader's `finishBatch` and from the
 * daily cleanup alike — one factory, so both announce the same way.
 *
 * The post is the uploader's, made as `createPost` makes a written one (the
 * same author name, topic, XP and activity), but its media is the batch:
 * `galleryBatch`, never pictures, a GIF, a video or a poll, and always
 * community visibility, whatever the batch's own (the collage's items
 * follow the gallery's read rule per viewer). Its text is the batch's
 * caption, which may be empty. It mentions no one: the upload dialog has no
 * mention picker, and guessing members from "@Name" in the caption could
 * notify the wrong person (the feed-posts hook stores no mentions).
 *
 * No post is made (null) when the uploader may no longer post to the
 * community's feed: they left, were banned, lost paid access, or are a plain
 * member under an admins-only feed. The batch stays finished either way.
 *
 * `galleryBatch` is unique, so a batch is announced at most once: a call
 * that loses to another (a retry after the batch's `feedPostId` failed to
 * save) gets that post's id back, and awards and logs nothing again.
 */
export function galleryAnnouncer(deps: AnnounceDeps): AnnounceBatch {
  const log = deps.log ?? console.error;
  return async (batch) => {
    if (!(await uploaderMayPost(deps.db, batch))) return null;
    const { communityId, uploaderId: authorId } = batch;
    const content = batch.caption ?? "";
    const author = await deps.db.query.user.findFirst({
      where: eq(user.id, authorId),
      columns: { name: true },
    });
    const topicSlug = await topicOf(deps.payload, batch);
    let postId: number;
    try {
      const post = await deps.payload.create({
        collection: "feed-posts",
        data: {
          content,
          authorId,
          authorName: author?.name ?? "member",
          communityId,
          likeCount: 0,
          commentCount: 0,
          topicSlug,
          visibility: "community",
          galleryBatch: batch.id,
        },
      });
      postId = post.id;
    } catch (error) {
      if (!isDuplicateGalleryPost(error)) throw error;
      const existing = await postOf(deps.payload, batch.id);
      if (existing === null) throw error;
      return existing;
    }
    await rewardNewPost(deps.db, log, batch, postId);
    return postId;
  };
}

/**
 * Whether the uploader may still post to the community's feed: an active
 * member in good standing (`activeCommunityRole`, paid access included)
 * whom the feed policy lets post, in a community that still exists.
 */
async function uploaderMayPost(
  db: AnnounceDeps["db"],
  batch: GalleryBatch,
): Promise<boolean> {
  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.id, batch.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { feedPostPolicy: true },
  });
  if (!community) return false;
  const role = await activeCommunityRole(
    db,
    batch.communityId,
    batch.uploaderId,
  );
  return (
    role !== null &&
    canPostToFeed(community.feedPostPolicy, role as FeedMemberRole)
  );
}

/**
 * The XP and activity entry `createPost` gives a new post. The post stands
 * even if either fails: a thrown error would leave the batch without the
 * post it already has.
 */
async function rewardNewPost(
  db: AnnounceDeps["db"],
  log: NonNullable<AnnounceDeps["log"]>,
  batch: GalleryBatch,
  postId: number,
): Promise<void> {
  const { communityId, uploaderId: authorId } = batch;
  const detail = { batchId: batch.id, postId };
  try {
    await awardXp(db, authorId, XP_AMOUNTS.FEED_POST_CREATE);
  } catch (error) {
    log("[gallery.announce] awarding XP for a gallery post failed", {
      ...detail,
      error,
    });
  }
  try {
    await logActivity(db, {
      actorId: authorId,
      actorType: "member",
      action: "feed.post_created",
      targetType: "feed-posts",
      targetId: String(postId),
      communityId,
      metadata: { communityId, postId, kind: "gallery" },
    });
  } catch (error) {
    log("[gallery.announce] logging a gallery post failed", {
      ...detail,
      error,
    });
  }
}

/**
 * The batch's topic if the community still has it, else the default: a
 * topic deleted while the batch was open must not lose the post.
 */
async function topicOf(payload: Payload, batch: GalleryBatch): Promise<string> {
  try {
    return await resolvePostTopic(
      payload,
      batch.communityId,
      batch.topicSlug ?? undefined,
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
      return DEFAULT_TOPIC;
    }
    throw error;
  }
}

/** True when saving failed on the one-post-per-batch unique index. */
function isDuplicateGalleryPost(error: unknown): boolean {
  if (!(error instanceof ValidationError)) return false;
  const { collection, errors } = error.data;
  return (
    collection === "feed-posts" &&
    errors.length > 0 &&
    errors.every(
      (e) => e.path === "galleryBatch" || e.path === "gallery_batch_id",
    )
  );
}

/** The id of the post that announces the batch, if one does. */
async function postOf(
  payload: Payload,
  batchId: number,
): Promise<number | null> {
  const { docs } = await payload.find({
    collection: "feed-posts",
    where: { galleryBatch: { equals: batchId } },
    limit: 1,
    depth: 0,
  });
  return docs[0]?.id ?? null;
}
