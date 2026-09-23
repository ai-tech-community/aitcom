import { TRPCError } from "@trpc/server";
import { ValidationError, type Where } from "payload";

import type { PostReport } from "@/payload-types";
import type { VideoStorageSource } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import { canViewPost, type FeedViewer } from "./post-visibility";
import { cleanUpDeletedPostVideo } from "./video-posts";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export const REPORT_REASONS = ["spam", "inappropriate", "copyright", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportDeps = {
  payload: Payload;
  /** Reached only when a removed post has a video, so text moderation never needs S3. */
  storage: VideoStorageSource;
  notifyModerators: (input: { communityId: string; postId: number }) => Promise<void>;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
};

/** What a moderator sees of one report. Who reported stays private. */
export type PostReportView = {
  reason: PostReport["reason"];
  note: string | null;
  createdAt: string;
};

const ALREADY_REPORTED = "You already reported this post.";

/**
 * Reports a moderator hasn't dismissed yet. A restore dismisses reports
 * instead of deleting them, so the one-report-per-person rule still holds
 * for them; only open reports count toward hiding and show to moderators.
 */
function openReportsOf(postId: number): Where {
  return { and: [{ post: { equals: postId } }, { dismissedAt: { exists: false } }] };
}

async function loadPost(payload: Payload, postId: number) {
  try {
    return await payload.findByID({ collection: "feed-posts", id: postId, depth: 0 });
  } catch {
    return null;
  }
}

/**
 * True when creating a report failed on the one-report-per-reporter-per-post
 * unique index: a concurrent report by the same person won the race. Every
 * other field is validated before we get here, so a ValidationError from
 * this collection can only be that.
 */
function isDuplicateReport(error: unknown): boolean {
  return error instanceof ValidationError && error.data.collection === "post-reports";
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
    throw new TRPCError({ code: "BAD_REQUEST", message: "You can't report your own post." });
  }
  const { docs: existing } = await deps.payload.find({
    collection: "post-reports",
    where: {
      and: [{ post: { equals: post.id } }, { reporterId: { equals: input.reporterId } }],
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
    if (isDuplicateReport(error)) {
      throw new TRPCError({ code: "CONFLICT", message: ALREADY_REPORTED });
    }
    throw error;
  }
  // Count the stored open reports rather than adding one to the loaded
  // post, so two reports landing at once can't both write the same number.
  const { totalDocs: reportCount } = await deps.payload.count({
    collection: "post-reports",
    where: openReportsOf(post.id),
  });
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
      await deps.notifyModerators({ communityId: post.communityId, postId: post.id });
    } catch (error) {
      (deps.log ?? console.error)("[feed.reportPost] moderator notification failed", {
        postId: post.id,
        error,
      });
    }
  }
  return { hidden: true };
}

/**
 * Restore shows the post again and dismisses its open reports (kept, so
 * those reporters can't report it again). Remove deletes the post, its
 * files, and its reports.
 */
export async function reviewReport(
  deps: ReportDeps,
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
    throw new TRPCError({ code: "NOT_FOUND", message: "This post no longer exists." });
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
      data: { hiddenAt: null, reportCount: 0 },
    });
    return;
  }
  await deps.payload.update({
    collection: "feed-posts",
    id: post.id,
    data: { isDeleted: true, content: "", authorName: "", imageUrl: null },
  });
  // Best effort: the post is already removed, so a storage failure is
  // logged rather than failing the moderator's action.
  await cleanUpDeletedPostVideo(deps.storage, post, deps.log);
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
