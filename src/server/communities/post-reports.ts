import { TRPCError } from "@trpc/server";

import type { PostReport } from "@/payload-types";
import type { ObjectStorageSource } from "@/server/media/object-storage";
import type { VideoStorageSource } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import type { ReportReason } from "@/lib/post-report-reasons";
import {
  releaseBatchLink,
  removeBatchItems,
} from "@/server/gallery/feed-post-link";
import { relationId } from "@/server/gallery/relation-id";
import {
  countOpenReports,
  isDuplicateReportError,
  openReportsWhere,
  RESTORE_PATCH,
} from "@/server/moderation/report-rules";
import { canViewPost, type FeedViewer } from "./post-visibility";
import { cleanUpPostImages } from "./feed-images";
import { removedPostData } from "./post-media-fields";
import { cleanUpPostVideoFiles } from "./post-video-files";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export { REPORT_REASONS, type ReportReason } from "@/lib/post-report-reasons";

export type ReportDeps = {
  payload: Payload;
  /** Reached only when a removed post has a video, so text moderation never needs S3. */
  storage: VideoStorageSource;
  notifyModerators: (input: {
    communityId: string;
    postId: number;
    /** A video post, so the notice can open it on its reel. */
    isVideo: boolean;
  }) => Promise<void>;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
};

/** What reviewing a report needs on top of reporting. */
export type ReviewDeps = ReportDeps & {
  /**
   * Gallery object storage, reached only when a removed post is a gallery
   * post (its batch's items go with it).
   */
  galleryStorage: ObjectStorageSource;
};

/** What a moderator sees of one report. Who reported stays private. */
export type PostReportView = {
  reason: PostReport["reason"];
  note: string | null;
  createdAt: string;
};

const ALREADY_REPORTED = "You already reported this post.";

/** A post's open reports (see `openReportsWhere`). */
const openReportsOf = (postId: number) =>
  openReportsWhere("post-reports", postId);

async function loadPost(payload: Payload, postId: number) {
  try {
    return await payload.findByID({
      collection: "feed-posts",
      id: postId,
      depth: 0,
    });
  } catch {
    return null;
  }
}

/** The first report hides the post until a moderator reviews it. */
export async function reportPost(
  deps: ReportDeps,
  input: {
    postId: number;
    reporterId: string;
    reason: ReportReason;
    note: string;
    viewer: FeedViewer;
  },
): Promise<{ hidden: boolean }> {
  const post = await loadPost(deps.payload, input.postId);
  if (!post || !canViewPost(post, input.viewer)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (post.authorId === input.reporterId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You can't report your own post.",
    });
  }
  const { docs: existing } = await deps.payload.find({
    collection: "post-reports",
    where: {
      and: [
        { post: { equals: post.id } },
        { reporterId: { equals: input.reporterId } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  if (existing.length > 0) {
    throw new TRPCError({ code: "CONFLICT", message: ALREADY_REPORTED });
  }
  try {
    await deps.payload.create({
      collection: "post-reports",
      data: {
        post: post.id,
        reporterId: input.reporterId,
        reason: input.reason,
        note: input.note.trim() || undefined,
      },
    });
  } catch (error) {
    if (isDuplicateReportError(error, "post-reports")) {
      throw new TRPCError({ code: "CONFLICT", message: ALREADY_REPORTED });
    }
    throw error;
  }
  const reportCount = await countOpenReports(
    deps.payload,
    "post-reports",
    post.id,
  );
  const firstReport = !post.hiddenAt;
  await deps.payload.update({
    collection: "feed-posts",
    id: post.id,
    data: {
      hiddenAt: post.hiddenAt ?? (deps.now?.() ?? new Date()).toISOString(),
      reportCount,
    },
  });
  if (firstReport && post.communityId) {
    // The report and the hide are stored; a failed notification must not
    // tell the reporter it failed (a retry would only say "already reported").
    try {
      await deps.notifyModerators({
        communityId: post.communityId,
        postId: post.id,
        isVideo: Boolean(post.video?.key),
      });
    } catch (error) {
      (deps.log ?? console.error)(
        "[feed.reportPost] moderator notification failed",
        {
          postId: post.id,
          error,
        },
      );
    }
  }
  return { hidden: true };
}

/**
 * Restore shows the post again and dismisses its open reports (kept, so
 * those reporters can't report it again). Remove deletes the post, its
 * files, and its reports. Removing a gallery post removes its batch's items
 * from the gallery too (the report is about that content), first: if they
 * cannot all be deleted, the post stays hidden, still pointing at its
 * batch, so the moderator can try again. Restoring leaves the items alone.
 */
export async function reviewReport(
  deps: ReviewDeps,
  input: { postId: number; action: "restore" | "remove" },
): Promise<void> {
  const clearReports = () =>
    deps.payload.delete({
      collection: "post-reports",
      where: { post: { equals: input.postId } },
    });
  const post = await loadPost(deps.payload, input.postId);
  if (!post || post.isDeleted) {
    await clearReports();
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This post no longer exists.",
    });
  }
  if (input.action === "restore") {
    await deps.payload.update({
      collection: "post-reports",
      where: openReportsOf(post.id),
      data: { dismissedAt: (deps.now?.() ?? new Date()).toISOString() },
    });
    await deps.payload.update({
      collection: "feed-posts",
      id: post.id,
      data: { ...RESTORE_PATCH },
    });
    return;
  }
  const batchId = relationId(post.galleryBatch);
  if (batchId !== null) {
    await removeBatchItems(
      { payload: deps.payload, storage: deps.galleryStorage, log: deps.log },
      batchId,
    );
  }
  await deps.payload.update({
    collection: "feed-posts",
    id: post.id,
    data: removedPostData(),
  });
  if (batchId !== null) {
    await releaseBatchLink(deps, { batchId, postId: post.id });
  }
  // Best effort: the post is already removed, so a storage failure is
  // logged rather than failing the moderator's action.
  await cleanUpPostVideoFiles(deps.storage, post, {
    context: "feed.reviewReport",
    log: deps.log,
  });
  await cleanUpPostImages(deps.payload, post, [], {
    context: "feed.reviewReport",
    log: deps.log,
  });
  await clearReports();
}

/** A post's open reports, newest first, for its community's moderators. */
export async function listPostReports(
  payload: Payload,
  postId: number,
): Promise<PostReportView[]> {
  const { docs } = await payload.find({
    collection: "post-reports",
    where: openReportsOf(postId),
    sort: "-createdAt",
    pagination: false,
    depth: 0,
  });
  return docs.map((report) => ({
    reason: report.reason,
    note: report.note ?? null,
    createdAt: report.createdAt,
  }));
}
