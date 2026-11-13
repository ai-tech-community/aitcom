import { randomUUID } from "node:crypto";

import {
  GALLERY_BATCH_TEXT_MAX,
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_OPEN_BATCHES,
  GALLERY_MAX_VIDEOS_PER_BATCH,
  GALLERY_PHOTO_CONTENT_TYPES,
  GALLERY_PHOTO_MAX_BYTES,
  GALLERY_PHOTOS_PER_DAY,
  GALLERY_THUMB_CONTENT_TYPE,
  GALLERY_THUMB_MAX_BYTES,
  GALLERY_VIDEO_CONTENT_TYPE,
  GALLERY_VIDEOS_PER_DAY,
  galleryObjectKeys,
  type GalleryMediaType,
} from "@/lib/gallery-rules";
import { clampText } from "@/lib/text-utils";
import {
  FINISH_WINDOW_HOURS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  storageClassFor,
  type VideoVisibility,
} from "@/lib/video-rules";
import type { GalleryBatch, GalleryItem } from "@/payload-types";
import {
  allowanceFor,
  exceedsAllowance,
  usageFor,
} from "@/server/media/media-allowance";
import type {
  PresignedUpload,
  StoredObject,
} from "@/server/media/object-storage";

import { transitionStatus } from "@/server/payload-status-transition";

import {
  assertCommunityTopic,
  assertLinkableEvent,
  loadGalleryViewer,
  loadGalleryViewerById,
  publicItemsReachOutsiders,
} from "./access";
import { nowOf, type GalleryDeps } from "./deps";
import { galleryError } from "./errors";
import { galleryEnabled } from "./flag";
import { removeItemFiles } from "./item-files";
import { relationId } from "./relation-id";

export type { GalleryDeps } from "./deps";

/**
 * The gallery upload lifecycle (spec 2026-11-13, Upload flow): start a batch
 * → for each file, once the browser has shrunk or converted it, start an
 * item (grants for the file and its thumbnail) → the browser POSTs both
 * straight to S3 → finish the item (or discard it) → finish the batch.
 * Grants are issued one file at a time because each lives only ten minutes.
 * Mirrors the classroom hosted-file lifecycle (`hosted-files.ts`).
 */

/** What the uploader gets back for a finished item. Never storage keys. */
export type GalleryItemOwnView = {
  id: number;
  status: "ready";
  mediaType: GalleryMediaType;
  width: number;
  height: number;
};

/**
 * Makes the feed post for a batch that was just finished with ready items,
 * returning its id (or null when none is made). `galleryAnnouncer`
 * (`./announce`) is the one the router and the cleanup pass.
 */
export type AnnounceBatch = (
  batch: GalleryBatch,
  readyItems: GalleryItem[],
) => Promise<number | null>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why an item is failed. "cancelled" (the browser transfer was discarded) is
 * kept so it still counts toward the daily quota, and toward storage until
 * its grant expires.
 */
const FAILURE = {
  mismatch: "UPLOAD_MISMATCH",
  cancelled: "cancelled",
} as const;

/** Items that take up a place in their batch's plan. */
const PLAN_COUNTED_STATUSES = ["uploading", "ready"] as const;

/** What each kind of file may be, at start and again when it is checked. */
const FILE_RULES: Record<
  GalleryMediaType,
  { contentTypes: readonly string[]; maxBytes: number }
> = {
  photo: {
    contentTypes: GALLERY_PHOTO_CONTENT_TYPES,
    maxBytes: GALLERY_PHOTO_MAX_BYTES,
  },
  video: {
    contentTypes: [GALLERY_VIDEO_CONTENT_TYPE],
    maxBytes: MAX_VIDEO_BYTES,
  },
};

const DAILY_LIMIT: Record<GalleryMediaType, number> = {
  photo: GALLERY_PHOTOS_PER_DAY,
  video: GALLERY_VIDEOS_PER_DAY,
};

function isWholeNumber(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}

/** Nobody may start uploading while the gallery is switched off. */
function assertGalleryEnabled(): void {
  if (!galleryEnabled()) throw galleryError("GALLERY_DISABLED");
}

/** Gallery items of this type the user started in the last 24 hours, any status. */
async function uploadsToday(
  deps: GalleryDeps,
  userId: string,
  mediaType: GalleryMediaType,
  now: Date,
): Promise<number> {
  const { totalDocs } = await deps.payload.count({
    collection: "gallery-items",
    where: {
      and: [
        { uploaderId: { equals: userId } },
        { mediaType: { equals: mediaType } },
        {
          createdAt: {
            greater_than: new Date(now.getTime() - DAY_MS).toISOString(),
          },
        },
      ],
    },
  });
  return totalDocs;
}

/** The moment before which a record is past its finish window. */
function finishWindowStart(now: Date): Date {
  return new Date(now.getTime() - FINISH_WINDOW_HOURS * 60 * 60 * 1000);
}

/** Past the finish window the daily cleanup may already be acting on it. */
function isPastFinishWindow(createdAt: string, now: Date): boolean {
  return new Date(createdAt).getTime() < finishWindowStart(now).getTime();
}

/**
 * The user's batches, in any community, still open inside their finish
 * window: the ones a `startItem` could still add to.
 */
async function openBatchesOf(
  deps: GalleryDeps,
  userId: string,
  now: Date,
): Promise<number> {
  const { totalDocs } = await deps.payload.count({
    collection: "gallery-batches",
    where: {
      and: [
        { uploaderId: { equals: userId } },
        { status: { equals: "open" } },
        {
          createdAt: { greater_than: finishWindowStart(now).toISOString() },
        },
      ],
    },
  });
  return totalDocs;
}

/**
 * Checks, in order: the gallery is on; the caller is an active member (paid
 * where required); the plan is 1–30 files, at most 10 of them videos;
 * "Everyone" is asked for only where it reaches outsiders (never quietly
 * kept to members instead); the event and topic belong to the community;
 * the caller has fewer than GALLERY_MAX_OPEN_BATCHES batches open, and
 * today's quotas leave room for the whole plan. Then opens the batch every
 * item of this upload belongs to.
 */
export async function startBatch(
  deps: GalleryDeps,
  input: {
    userId: string;
    slug: string;
    eventId?: number;
    topicSlug?: string;
    visibility: VideoVisibility;
    magazineConsent: boolean;
    caption?: string;
    plannedFiles: number;
    plannedVideos: number;
  },
): Promise<{ batchId: number }> {
  assertGalleryEnabled();
  const viewer = await loadGalleryViewer(deps, {
    slug: input.slug,
    userId: input.userId,
  });
  if (!viewer.isMember) throw galleryError("NOT_A_MEMBER");
  const { plannedFiles, plannedVideos } = input;
  const planFits =
    isWholeNumber(plannedFiles, 1) &&
    plannedFiles <= GALLERY_MAX_FILES_PER_BATCH &&
    isWholeNumber(plannedVideos, 0) &&
    plannedVideos <= Math.min(GALLERY_MAX_VIDEOS_PER_BATCH, plannedFiles);
  if (!planFits) throw galleryError("BATCH_TOO_LARGE");

  if (
    input.visibility === "public" &&
    !(await publicItemsReachOutsiders(deps, viewer.community))
  ) {
    throw galleryError("PUBLIC_NOT_AVAILABLE");
  }

  const now = nowOf(deps);
  const communityId = viewer.communityId;
  if (input.eventId !== undefined) {
    await assertLinkableEvent(deps.payload, communityId, input.eventId, now);
  }
  if (input.topicSlug !== undefined) {
    await assertCommunityTopic(deps.payload, communityId, input.topicSlug);
  }

  const [openBatches, photosToday, videosToday] = await Promise.all([
    openBatchesOf(deps, input.userId, now),
    uploadsToday(deps, input.userId, "photo", now),
    uploadsToday(deps, input.userId, "video", now),
  ]);
  if (
    openBatches >= GALLERY_MAX_OPEN_BATCHES ||
    photosToday + (plannedFiles - plannedVideos) > DAILY_LIMIT.photo ||
    videosToday + plannedVideos > DAILY_LIMIT.video
  ) {
    throw galleryError("UPLOAD_LIMIT");
  }

  const caption = clampText(
    input.caption?.trim() ?? "",
    GALLERY_BATCH_TEXT_MAX,
  );
  const batch = await deps.payload.create({
    collection: "gallery-batches",
    data: {
      communityId,
      uploaderId: input.userId,
      event: input.eventId ?? null,
      topicSlug: input.topicSlug ?? null,
      visibility: input.visibility,
      magazineConsent: input.magazineConsent,
      magazineConsentAt: input.magazineConsent ? now.toISOString() : null,
      caption: caption || null,
      plannedFiles,
      plannedVideos,
      status: "open",
    },
  });
  return { batchId: batch.id };
}

/**
 * The caller's own open batch, still inside its finish window. Anything
 * else — unknown, someone else's, finished, too old — is UPLOAD_EXPIRED, so a
 * batch id reveals nothing about other people's uploads.
 */
async function requireOpenOwnBatch(
  deps: GalleryDeps,
  input: { userId: string; batchId: number },
  now: Date,
): Promise<GalleryBatch> {
  const batch = await requireOwnBatch(deps, input);
  if (batch.status !== "open" || isPastFinishWindow(batch.createdAt, now)) {
    throw galleryError("UPLOAD_EXPIRED");
  }
  return batch;
}

/** Refuses a file that would go past what the batch planned. */
async function assertFitsPlan(
  deps: GalleryDeps,
  batch: GalleryBatch,
  mediaType: GalleryMediaType,
): Promise<void> {
  const { docs } = await deps.payload.find({
    collection: "gallery-items",
    where: {
      and: [
        { batch: { equals: batch.id } },
        { status: { in: [...PLAN_COUNTED_STATUSES] } },
      ],
    },
    select: { mediaType: true },
    pagination: false,
    depth: 0,
  });
  const ofType = docs.filter((doc) => doc.mediaType === mediaType).length;
  const plannedOfType =
    mediaType === "video"
      ? batch.plannedVideos
      : batch.plannedFiles - batch.plannedVideos;
  if (docs.length >= batch.plannedFiles || ofType >= plannedOfType) {
    throw galleryError("BATCH_TOO_LARGE");
  }
}

/**
 * Refuses a file whose declared type, size or length is not allowed. Sizes,
 * dimensions and a video's duration that are not positive whole numbers are
 * malformed (the browser never sends them): UPLOAD_FAILED.
 */
function assertFileAllowed(input: {
  mediaType: GalleryMediaType;
  contentType: string;
  bytes: number;
  thumbnailBytes: number;
  width: number;
  height: number;
  durationSeconds?: number;
}): void {
  const isVideo = input.mediaType === "video";
  const wellFormed =
    isWholeNumber(input.bytes, 1) &&
    isWholeNumber(input.thumbnailBytes, 1) &&
    isWholeNumber(input.width, 1) &&
    isWholeNumber(input.height, 1) &&
    (!isVideo ||
      (typeof input.durationSeconds === "number" && input.durationSeconds > 0));
  if (!wellFormed) throw galleryError("UPLOAD_FAILED");
  const rules = FILE_RULES[input.mediaType];
  if (!rules.contentTypes.includes(input.contentType)) {
    throw galleryError("FILE_TYPE_NOT_ALLOWED");
  }
  if (
    input.bytes > rules.maxBytes ||
    input.thumbnailBytes > GALLERY_THUMB_MAX_BYTES ||
    (isVideo && (input.durationSeconds ?? 0) > MAX_VIDEO_SECONDS)
  ) {
    throw galleryError("FILE_TOO_LARGE");
  }
}

/**
 * Checks, in order: the gallery is on; the batch is the caller's, open and
 * inside its finish window; its community still exists and the caller is
 * still a member; the file is
 * allowed; it fits the batch's plan and today's quota; the community's
 * allowance has room for the file and its thumbnail. Then grants one
 * presigned POST each for the file and the thumbnail, pinned to their keys,
 * types and declared sizes, and records the item as uploading.
 */
export async function startItem(
  deps: GalleryDeps,
  input: {
    userId: string;
    batchId: number;
    mediaType: GalleryMediaType;
    contentType: string;
    bytes: number;
    thumbnailBytes: number;
    width: number;
    height: number;
    durationSeconds?: number;
  },
): Promise<{
  itemId: number;
  file: PresignedUpload;
  thumbnail: PresignedUpload;
}> {
  assertGalleryEnabled();
  const now = nowOf(deps);
  const batch = await requireOpenOwnBatch(deps, input, now);
  const viewer = await loadGalleryViewerById(deps, {
    communityId: batch.communityId,
    userId: input.userId,
  });
  // A deleted community is answered like an unknown batch.
  if (!viewer) throw galleryError("UPLOAD_EXPIRED");
  if (!viewer.isMember) throw galleryError("NOT_A_MEMBER");
  assertFileAllowed(input);
  await assertFitsPlan(deps, batch, input.mediaType);
  const today = await uploadsToday(deps, input.userId, input.mediaType, now);
  if (today >= DAILY_LIMIT[input.mediaType]) {
    throw galleryError("UPLOAD_LIMIT");
  }

  const bytes = input.bytes + input.thumbnailBytes;
  const [usage, allowance] = await Promise.all([
    usageFor(deps.payload, batch.communityId, now),
    allowanceFor(batch.communityId),
  ]);
  if (exceedsAllowance(usage, allowance, bytes)) {
    throw galleryError("STORAGE_FULL");
  }

  const uploadId = deps.newUploadId?.() ?? randomUUID();
  const storage = storageClassFor(batch.visibility);
  const { fileKey, thumbnailKey } = galleryObjectKeys({
    storage,
    communityId: batch.communityId,
    uploadId,
    mediaType: input.mediaType,
  });
  // Presign first: the grants need only the keys, and a failure here must
  // not leave a record behind that counts against the allowance.
  const objectStorage = deps.storage();
  const [file, thumbnail] = await Promise.all([
    objectStorage.presignUpload({
      key: fileKey,
      contentType: input.contentType,
      maxBytes: input.bytes,
    }),
    objectStorage.presignUpload({
      key: thumbnailKey,
      contentType: GALLERY_THUMB_CONTENT_TYPE,
      maxBytes: input.thumbnailBytes,
    }),
  ]);
  const item = await deps.payload.create({
    collection: "gallery-items",
    data: {
      communityId: batch.communityId,
      event: relationId(batch.event),
      topicSlug: batch.topicSlug ?? null,
      mediaType: input.mediaType,
      status: "uploading",
      storage,
      visibility: batch.visibility,
      fileKey,
      thumbnailKey,
      width: input.width,
      height: input.height,
      bytes,
      durationSeconds:
        input.mediaType === "video" ? (input.durationSeconds ?? null) : null,
      uploaderId: input.userId,
      batch: batch.id,
      uploadId,
      magazineConsent: batch.magazineConsent ?? false,
      magazineConsentAt: batch.magazineConsentAt ?? null,
    },
  });
  return { itemId: item.id, file, thumbnail };
}

/**
 * The caller's own item. Anything else — unknown, or someone else's — is
 * UPLOAD_EXPIRED, so an item id reveals nothing about other uploads.
 */
async function requireOwnItem(
  deps: GalleryDeps,
  input: { userId: string; itemId: number },
): Promise<GalleryItem> {
  const item = await deps.payload.findByID({
    collection: "gallery-items",
    id: input.itemId,
    depth: 0,
    disableErrors: true,
  });
  if (item?.uploaderId !== input.userId) {
    throw galleryError("UPLOAD_EXPIRED");
  }
  return item;
}

/**
 * Move an item out of "uploading", but only if it is still uploading, in one
 * statement, so finish and discard can never both win. Returns whether this
 * call moved it; re-read the item to see what a concurrent request left.
 */
function leaveUploading(
  deps: GalleryDeps,
  itemId: number,
  to: { status: "ready" } | { status: "failed"; failureReason: string },
): Promise<boolean> {
  return transitionStatus(deps.payload, {
    collection: "gallery-items",
    id: itemId,
    from: "uploading",
    to: to.status,
    ...("failureReason" in to && { set: { failureReason: to.failureReason } }),
  });
}

/**
 * Whether S3 holds what the grants allowed: both objects, each of its type
 * and 1 byte up to its limit, and together no more than declared at start.
 * (The grants already capped each object at its own declared size.)
 */
function isValidUpload(
  item: GalleryItem,
  file: StoredObject | null,
  thumbnail: StoredObject | null,
): boolean {
  if (!file || !thumbnail) return false;
  const rules = FILE_RULES[item.mediaType];
  return (
    file.contentType !== null &&
    rules.contentTypes.includes(file.contentType) &&
    file.bytes > 0 &&
    file.bytes <= rules.maxBytes &&
    thumbnail.contentType === GALLERY_THUMB_CONTENT_TYPE &&
    thumbnail.bytes > 0 &&
    thumbnail.bytes <= GALLERY_THUMB_MAX_BYTES &&
    file.bytes + thumbnail.bytes <= item.bytes
  );
}

function ownView(item: GalleryItem): GalleryItemOwnView {
  return {
    id: item.id,
    status: "ready",
    mediaType: item.mediaType,
    width: item.width,
    height: item.height,
  };
}

/** What finish answers for an item that is no longer uploading. */
function settledItem(item: GalleryItem): GalleryItemOwnView {
  if (item.status === "ready") return ownView(item);
  if (item.status === "failed") throw galleryError("UPLOAD_FAILED");
  // Still uploading after a lost conditional write cannot happen; refuse
  // rather than report a file that was never checked.
  throw galleryError("UPLOAD_EXPIRED");
}

/**
 * Checks what S3 actually stored for the file and its thumbnail. Good →
 * ready. Bad → the item is marked failed, then both objects removed, and the
 * caller told UPLOAD_FAILED. A second finish of a ready item returns it.
 * Past the finish window nothing is touched: the daily cleanup may already
 * be acting on it. If a concurrent finish or discard settled it first, that
 * result stands. The batch's state is not checked: an item finished after its
 * batch was finished (a slow last file) still becomes ready and joins the
 * gallery, just without being in the batch's announcement.
 */
export async function finishItem(
  deps: GalleryDeps,
  input: { userId: string; itemId: number },
): Promise<GalleryItemOwnView> {
  const item = await requireOwnItem(deps, input);
  if (item.status !== "uploading") return settledItem(item);
  if (isPastFinishWindow(item.createdAt, nowOf(deps))) {
    throw galleryError("UPLOAD_EXPIRED");
  }
  const storage = deps.storage();
  const [file, thumbnail] = await Promise.all([
    storage.inspect(item.fileKey),
    storage.inspect(item.thumbnailKey),
  ]);
  if (!isValidUpload(item, file, thumbnail)) {
    const failed = await leaveUploading(deps, item.id, {
      status: "failed",
      failureReason: FAILURE.mismatch,
    });
    if (!failed) return settledItem(await requireOwnItem(deps, input));
    await removeItemFiles(deps, item, "finishItem");
    throw galleryError("UPLOAD_FAILED");
  }
  if (await leaveUploading(deps, item.id, { status: "ready" })) {
    return ownView(item);
  }
  return settledItem(await requireOwnItem(deps, input));
}

/**
 * Called when the browser transfer is cancelled or fails before finish. The
 * item is kept, marked failed ("cancelled"): it still counts toward the daily
 * quota, and toward storage until its grant expires; any part already stored
 * is removed, best effort (the daily cleanup removes the row later). Only an
 * item still uploading changes — a ready or failed one, including one a
 * concurrent finish just settled, is left as it is.
 */
export async function discardItem(
  deps: GalleryDeps,
  input: { userId: string; itemId: number },
): Promise<void> {
  const item = await requireOwnItem(deps, input);
  if (item.status !== "uploading") return;
  if (isPastFinishWindow(item.createdAt, nowOf(deps))) {
    throw galleryError("UPLOAD_EXPIRED");
  }
  const discarded = await leaveUploading(deps, item.id, {
    status: "failed",
    failureReason: FAILURE.cancelled,
  });
  // A concurrent finish settled it first: its result stands.
  if (!discarded) return;
  await removeItemFiles(deps, item, "discardItem");
}

/** The batch's ready items, oldest first. */
async function readyItemsOf(
  deps: Pick<GalleryDeps, "payload">,
  batchId: number,
): Promise<GalleryItem[]> {
  const { docs } = await deps.payload.find({
    collection: "gallery-items",
    where: {
      and: [{ batch: { equals: batchId } }, { status: { equals: "ready" } }],
    },
    sort: "id",
    pagination: false,
    depth: 0,
  });
  return docs;
}

/**
 * Moves a batch from open to finished — only if it is still open, in one
 * statement, so of a user's finish, a second finish and the daily cleanup
 * exactly one closes it. The call that closes it, and only that one,
 * announces it (when it has ready items and `announce` is given) and stores
 * the announcement's post; a failed announcement, or a failure to store its
 * post on the batch, is logged and the batch stays finished. The one rule
 * for finishing a batch: `finishBatch` and the cleanup both go through
 * here, so the announcement is wired in one place.
 *
 * `readyItems` are read after the move, so no item that became ready before
 * it is missed. `feedPostId` is the post this call's announcement made, if
 * any (stored on the batch unless that save failed).
 */
export async function closeBatch(
  deps: Pick<GalleryDeps, "payload" | "log">,
  batch: GalleryBatch,
  options: { announce?: AnnounceBatch; context: string },
): Promise<{
  closed: boolean;
  readyItems: GalleryItem[];
  feedPostId: number | null;
}> {
  const closed =
    batch.status === "open" &&
    (await transitionStatus(deps.payload, {
      collection: "gallery-batches",
      id: batch.id,
      from: "open",
      to: "finished",
    }));
  const readyItems = await readyItemsOf(deps, batch.id);
  if (!closed || !options.announce || readyItems.length === 0) {
    return { closed, readyItems, feedPostId: null };
  }

  const log = deps.log ?? console.error;
  let feedPostId: number | null = null;
  try {
    feedPostId = await options.announce(
      { ...batch, status: "finished" },
      readyItems,
    );
  } catch (error) {
    log(`[gallery.${options.context}] announcing a finished batch failed`, {
      batchId: batch.id,
      error,
    });
  }
  if (feedPostId !== null) {
    try {
      await deps.payload.update({
        collection: "gallery-batches",
        id: batch.id,
        data: { feedPostId },
      });
    } catch (error) {
      // The post exists and points at the batch (`galleryBatch`), which
      // keeps the batch from the empty-batch cleanup; only the batch's own
      // link is missing.
      log(
        `[gallery.${options.context}] storing a finished batch's feed post failed`,
        { batchId: batch.id, feedPostId, error },
      );
    }
  }
  return { closed, readyItems, feedPostId };
}

/**
 * Finishes the caller's batch (`closeBatch`). A call that did not close it —
 * a second finish, or one that lost the race to a concurrent finish or the
 * cleanup — returns what is stored.
 */
export async function finishBatch(
  deps: GalleryDeps,
  input: { userId: string; batchId: number },
  announce?: AnnounceBatch,
): Promise<{ readyCount: number; feedPostId: number | null }> {
  const batch = await requireOwnBatch(deps, input);
  const result = await closeBatch(deps, batch, {
    announce,
    context: "finishBatch",
  });
  if (result.closed) {
    return {
      readyCount: result.readyItems.length,
      feedPostId: result.feedPostId,
    };
  }
  // Lost the move to a concurrent finish: read what that one stored.
  const current =
    batch.status === "open" ? await requireOwnBatch(deps, input) : batch;
  return {
    readyCount: result.readyItems.length,
    feedPostId: current.feedPostId ?? null,
  };
}

/** The caller's own batch, whatever its state; anything else UPLOAD_EXPIRED. */
async function requireOwnBatch(
  deps: GalleryDeps,
  input: { userId: string; batchId: number },
): Promise<GalleryBatch> {
  const batch = await deps.payload.findByID({
    collection: "gallery-batches",
    id: input.batchId,
    depth: 0,
    disableErrors: true,
  });
  if (batch?.uploaderId !== input.userId) {
    throw galleryError("UPLOAD_EXPIRED");
  }
  return batch;
}
