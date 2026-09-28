import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { Where } from "payload";

import { env } from "@/env";
import { canUploadMaterials } from "@/lib/classroom";
import { mayDownloadMaterial } from "@/lib/classroom/material-access";
import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_TITLE_MAX,
  MATERIAL_UPLOADS_PER_DAY,
  MAX_FILE_BYTES,
  clampText,
  contentTypeFor,
  downloadFileName,
  fileExtensionOf,
  isInlinePreviewable,
  materialObjectKey,
  titleFromFileName,
  type MaterialStatus,
  type MaterialVisibility,
} from "@/lib/classroom/material-rules";
import { FINISH_WINDOW_HOURS } from "@/lib/video-rules";
import type { HostedMaterial } from "@/payload-types";
import {
  loadCourseAccess,
  requireEditableCourse,
} from "@/server/classroom/course-access";
import {
  allowanceFor,
  exceedsAllowance,
  mayUploadGrantBeLive,
  usageFor,
} from "@/server/classroom/media-allowance";
import type { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import type {
  ObjectStorageSource,
  PresignedUpload,
} from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * The hosted-file lifecycle (spec 2026-09-27 §4): start → the browser POSTs
 * straight to S3 → finish (or discard, when the browser transfer is cancelled
 * or fails); then links, listing, rename, visibility, delete.
 * Dependencies are injected so every rule is unit-tested with fakes; the
 * classroomMaterials router is a thin shell over these functions.
 */
export type HostedFileDeps = {
  payload: Payload;
  db: typeof db;
  storage: ObjectStorageSource;
  now?: () => Date;
  newUploadId?: () => string;
  log?: (message: string, detail: unknown) => void;
};

/** What the course author sees of a file. Never includes storage keys. */
export type CourseMaterial = {
  id: number;
  title: string;
  extension: string;
  contentType: string;
  bytes: number;
  status: MaterialStatus;
  visibility: MaterialVisibility;
  failureReason: string | null;
  createdAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why a record is failed. "cancelled" (the browser transfer was discarded)
 * and "deleted" (the author deleted it while its upload grant may still be
 * live) are kept only so they keep counting until the cleanup removes them;
 * the author never sees them.
 */
const FAILURE = {
  mismatch: "UPLOAD_MISMATCH",
  cancelled: "cancelled",
  deleted: "deleted",
} as const;
const HIDDEN_FAILURES = [FAILURE.cancelled, FAILURE.deleted];

/**
 * Matches the files that still exist as far as people are concerned: every
 * record except a cancelled or deleted upload kept only for accounting. The
 * author's file list and the lesson manifest both use it, so a file the
 * author deleted shows as removed in lessons, not as failed.
 */
export const EXISTING_MATERIAL: Where = {
  or: [
    { status: { not_equals: "failed" } },
    { failureReason: { exists: false } },
    { failureReason: { not_in: HIDDEN_FAILURES } },
  ],
};

function toCourseMaterial(m: HostedMaterial): CourseMaterial {
  return {
    id: m.id,
    title: m.title,
    extension: m.extension,
    contentType: m.contentType,
    bytes: m.bytes,
    status: m.status,
    visibility: m.visibility,
    failureReason: m.failureReason ?? null,
    createdAt: m.createdAt,
  };
}

function refuse(
  code: "FORBIDDEN" | "BAD_REQUEST" | "NOT_FOUND" | "TOO_MANY_REQUESTS",
  message: string,
): TRPCError {
  return new TRPCError({ code, message });
}

/**
 * The deployment switch for new uploads (`CLASSROOM_FILE_UPLOADS=on`). It
 * stays off until the storage bucket grants the app access to classroom
 * files; while off nobody may start an upload, and everything else (links,
 * listing, rename, delete, cleanup) keeps working.
 */
export function fileUploadsEnabled(): boolean {
  return env.CLASSROOM_FILE_UPLOADS === "on";
}

/**
 * May this user upload lesson files in this community, under its policy?
 * Never while uploads are switched off for the deployment.
 */
export async function mayUploadMaterials(
  database: typeof db,
  communityId: string,
  userId: string,
): Promise<boolean> {
  if (!fileUploadsEnabled()) return false;
  const community = await database.query.communities.findFirst({
    where: and(eq(communities.id, communityId), isNull(communities.deletedAt)),
    columns: { classroomUploadPolicy: true },
  });
  if (!community) return false;
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  return canUploadMaterials(
    community.classroomUploadPolicy,
    membership?.role ?? null,
  );
}

/**
 * Checks, in order: the caller edits this course; the community lets them
 * upload; the type is allowed; the size is 1 byte to 200 MB; the daily limit;
 * the storage allowance. Then grants one presigned POST pinned to the key,
 * the derived type and the declared size, and records the upload.
 */
export async function startFileUpload(
  deps: HostedFileDeps,
  input: { userId: string; courseId: number; fileName: string; bytes: number },
): Promise<{
  materialId: number;
  upload: PresignedUpload;
  contentType: string;
}> {
  const course = await requireEditableCourse(
    deps.payload,
    input.courseId,
    input.userId,
  );
  if (!(await mayUploadMaterials(deps.db, course.communityId, input.userId))) {
    throw refuse("FORBIDDEN", "UPLOADS_NOT_ALLOWED");
  }
  const extension = fileExtensionOf(input.fileName);
  if (!extension) throw refuse("BAD_REQUEST", "FILE_TYPE_NOT_ALLOWED");
  if (input.bytes < 1) throw refuse("BAD_REQUEST", "FILE_EMPTY");
  if (input.bytes > MAX_FILE_BYTES) {
    throw refuse("BAD_REQUEST", "FILE_TOO_LARGE");
  }

  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { totalDocs } = await deps.payload.count({
    collection: "hosted-materials",
    where: {
      and: [
        { uploaderId: { equals: input.userId } },
        { createdAt: { greater_than: since } },
      ],
    },
  });
  if (totalDocs >= MATERIAL_UPLOADS_PER_DAY) {
    throw refuse("TOO_MANY_REQUESTS", "UPLOAD_LIMIT");
  }

  const [usage, allowance] = await Promise.all([
    usageFor(deps.payload, course.communityId, now),
    allowanceFor(course.communityId),
  ]);
  if (exceedsAllowance(usage, allowance, input.bytes)) {
    throw refuse("FORBIDDEN", "STORAGE_FULL");
  }

  const uploadId = deps.newUploadId?.() ?? randomUUID();
  const contentType = contentTypeFor(extension);
  const storageKey = materialObjectKey({
    communityId: course.communityId,
    courseId: course.id,
    uploadId,
    ext: extension,
  });
  // Presign first: the grant needs only the key, and a failure here must
  // not leave a record behind that counts against the allowance.
  const upload = await deps.storage().presignUpload({
    key: storageKey,
    contentType,
    maxBytes: input.bytes,
  });
  const material = await deps.payload.create({
    collection: "hosted-materials",
    data: {
      communityId: course.communityId,
      course: course.id,
      uploaderId: input.userId,
      kind: "file",
      status: "uploading",
      title: titleFromFileName(input.fileName),
      visibility: "members",
      fileName: clampText(input.fileName.trim(), MATERIAL_FILE_NAME_MAX),
      extension,
      contentType,
      bytes: input.bytes,
      storageKey,
      uploadId,
    },
  });
  return { materialId: material.id, upload, contentType };
}

/**
 * The caller's own upload record. Anything else — unknown, or someone else's
 * — is UPLOAD_EXPIRED, so an upload id reveals nothing about other uploads.
 */
async function requireOwnUpload(
  deps: HostedFileDeps,
  input: { userId: string; materialId: number },
): Promise<HostedMaterial> {
  const material = await deps.payload.findByID({
    collection: "hosted-materials",
    id: input.materialId,
    depth: 0,
    disableErrors: true,
  });
  if (material?.uploaderId !== input.userId) {
    throw refuse("NOT_FOUND", "UPLOAD_EXPIRED");
  }
  return material;
}

/**
 * Move an upload out of "uploading", but only if it is still uploading, so
 * finish and discard can never overwrite each other. Returns the updated
 * record, or null when another request changed it first (re-read it with
 * `requireOwnUpload` to see what that request left).
 */
async function leaveUploading(
  deps: HostedFileDeps,
  materialId: number,
  data: { status: "ready" } | { status: "failed"; failureReason: string },
): Promise<HostedMaterial | null> {
  const { docs } = await deps.payload.update({
    collection: "hosted-materials",
    where: {
      and: [
        { id: { equals: materialId } },
        { status: { equals: "uploading" } },
      ],
    },
    data,
  });
  return docs[0] ?? null;
}

/** Past the finish window the daily cleanup may already be acting on it. */
function isPastFinishWindow(deps: HostedFileDeps, material: HostedMaterial) {
  const now = deps.now?.() ?? new Date();
  const cutoff = now.getTime() - FINISH_WINDOW_HOURS * 60 * 60 * 1000;
  return new Date(material.createdAt).getTime() < cutoff;
}

/**
 * Checks the object S3 actually stored: it must exist, have the derived type,
 * and be 1 byte up to the declared size. Good → ready. The record keeps the
 * declared size: the grant stays usable until it expires, so the key can
 * still receive up to that many bytes, and the allowance must keep counting
 * them. Bad → the record is marked failed, then the object deleted. A second
 * finish of a ready file returns it unchanged. Past the finish window nothing
 * is touched: the daily cleanup may already be acting on the upload. If a
 * concurrent finish or discard changed the record first, its result stands.
 */
export async function finishFileUpload(
  deps: HostedFileDeps,
  input: { userId: string; materialId: number },
): Promise<CourseMaterial> {
  const material = await requireOwnUpload(deps, input);
  if (material.status !== "uploading") return settledUpload(material);
  if (isPastFinishWindow(deps, material)) {
    throw refuse("NOT_FOUND", "UPLOAD_EXPIRED");
  }

  const storage = deps.storage();
  const stored = await storage.inspect(material.storageKey);
  const valid =
    stored !== null &&
    stored.contentType === material.contentType &&
    stored.bytes > 0 &&
    stored.bytes <= material.bytes &&
    stored.bytes <= MAX_FILE_BYTES;
  if (!valid) {
    const failed = await leaveUploading(deps, material.id, {
      status: "failed",
      failureReason: FAILURE.mismatch,
    });
    if (!failed) return settledUpload(await requireOwnUpload(deps, input));
    try {
      await storage.remove([material.storageKey]);
    } catch (error) {
      (deps.log ?? console.error)(
        "[classroomMaterials.finishFileUpload] removing a bad upload failed",
        { materialId: material.id, key: material.storageKey, error },
      );
    }
    throw refuse("BAD_REQUEST", "UPLOAD_FAILED");
  }
  const ready = await leaveUploading(deps, material.id, { status: "ready" });
  return settledUpload(ready ?? (await requireOwnUpload(deps, input)));
}

/** What finish answers for an upload that is no longer in progress. */
function settledUpload(material: HostedMaterial): CourseMaterial {
  if (material.status === "ready") return toCourseMaterial(material);
  if (material.status === "failed") {
    throw refuse("BAD_REQUEST", "UPLOAD_FAILED");
  }
  // Still uploading after a lost conditional write cannot happen; refuse
  // rather than report a file that was never checked.
  throw refuse("NOT_FOUND", "UPLOAD_EXPIRED");
}

/**
 * Called when the browser transfer is cancelled or fails before finish. The
 * record is kept but marked failed (reason "cancelled"): it still counts
 * toward the uploader's daily limit, and toward storage until its grant
 * expires; then any part already stored is removed, best effort (the daily
 * cleanup removes old failed records and their objects). Only an upload still
 * in progress changes: a ready or failed file — including one a concurrent
 * finish just settled — is returned as it is.
 */
export async function discardUpload(
  deps: HostedFileDeps,
  input: { userId: string; materialId: number },
): Promise<CourseMaterial> {
  const material = await requireOwnUpload(deps, input);
  if (material.status !== "uploading") return toCourseMaterial(material);
  if (isPastFinishWindow(deps, material)) {
    throw refuse("NOT_FOUND", "UPLOAD_EXPIRED");
  }
  const discarded = await leaveUploading(deps, material.id, {
    status: "failed",
    failureReason: FAILURE.cancelled,
  });
  if (!discarded) return toCourseMaterial(await requireOwnUpload(deps, input));
  try {
    await deps.storage().remove([material.storageKey]);
  } catch (error) {
    (deps.log ?? console.error)(
      "[classroomMaterials.discardUpload] removing a discarded upload failed",
      { materialId: material.id, key: material.storageKey, error },
    );
  }
  return toCourseMaterial(discarded);
}

/**
 * A signed link to a ready file. Access is decided on the file's own course
 * (never the lesson's): members and managers get every file, visitors of a
 * public course only free-preview files; everyone else gets NOT_FOUND.
 */
export async function fileLink(
  deps: HostedFileDeps,
  input: {
    viewerId: string | null;
    materialId: number;
    disposition: "inline" | "attachment";
  },
): Promise<{ url: string }> {
  const material = await deps.payload.findByID({
    collection: "hosted-materials",
    id: input.materialId,
    depth: 0,
    disableErrors: true,
  });
  if (material?.status !== "ready") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  const course = await deps.payload.findByID({
    collection: "courses",
    id: material.course,
    depth: 0,
    disableErrors: true,
  });
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  const access = await loadCourseAccess(deps.db, course, input.viewerId);
  if (!mayDownloadMaterial(access, material.visibility)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (
    input.disposition === "inline" &&
    !isInlinePreviewable(material.extension)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST" });
  }
  const url = await deps.storage().signedGetUrl(material.storageKey, {
    downloadName: downloadFileName(material.title, material.extension),
    disposition: input.disposition,
    contentType: material.contentType,
  });
  return { url };
}

/**
 * Every file of a course, newest first, for its author — except uploads
 * that were cancelled or deleted, which are kept only for accounting.
 */
export async function listCourseMaterials(
  deps: HostedFileDeps,
  input: { userId: string; courseId: number },
): Promise<CourseMaterial[]> {
  await requireEditableCourse(deps.payload, input.courseId, input.userId);
  const { docs } = await deps.payload.find({
    collection: "hosted-materials",
    where: {
      and: [{ course: { equals: input.courseId } }, EXISTING_MATERIAL],
    },
    sort: "-createdAt",
    pagination: false,
    depth: 0,
  });
  return docs.map(toCourseMaterial);
}

async function requireEditableMaterial(
  deps: HostedFileDeps,
  materialId: number,
  userId: string,
): Promise<HostedMaterial> {
  const material = await deps.payload.findByID({
    collection: "hosted-materials",
    id: materialId,
    depth: 0,
    disableErrors: true,
  });
  if (!material) throw new TRPCError({ code: "NOT_FOUND" });
  await requireEditableCourse(deps.payload, material.course, userId);
  return material;
}

/** Rename a file or change who may download it. */
export async function updateMaterial(
  deps: HostedFileDeps,
  input: {
    userId: string;
    materialId: number;
    title?: string;
    visibility?: MaterialVisibility;
  },
): Promise<CourseMaterial> {
  const material = await requireEditableMaterial(
    deps,
    input.materialId,
    input.userId,
  );
  const data: { title?: string; visibility?: MaterialVisibility } = {};
  if (input.title !== undefined) {
    data.title = clampText(input.title, MATERIAL_TITLE_MAX);
  }
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (Object.keys(data).length === 0) return toCourseMaterial(material);
  const updated = await deps.payload.update({
    collection: "hosted-materials",
    id: material.id,
    data,
  });
  return toCourseMaterial(updated);
}

/**
 * Delete a file. Lessons that still use it show it as removed.
 *
 * While the file's upload grant may still be live (it is still uploading, or
 * was created within the grant's lifetime), the grant could store a new
 * object at the key after we remove it. So the record is kept, marked failed
 * (reason "deleted"): hidden from the author, still counted against storage
 * until the grant expires, and removed with any late object by the daily
 * cleanup. Otherwise the record is deleted, which frees the allowance.
 * Either way the stored object is removed, best effort — a failure is logged.
 */
export async function deleteMaterial(
  deps: HostedFileDeps,
  input: { userId: string; materialId: number },
): Promise<{ ok: true }> {
  const material = await requireEditableMaterial(
    deps,
    input.materialId,
    input.userId,
  );
  const now = deps.now?.() ?? new Date();
  const grantMayBeLive =
    material.status === "uploading" ||
    mayUploadGrantBeLive(material.createdAt, now);
  if (grantMayBeLive) {
    await deps.payload.update({
      collection: "hosted-materials",
      id: material.id,
      data: { status: "failed", failureReason: FAILURE.deleted },
    });
  }
  try {
    await deps.storage().remove([material.storageKey]);
  } catch (error) {
    (deps.log ?? console.error)(
      "[classroomMaterials.deleteMaterial] removing the stored file failed",
      { materialId: material.id, key: material.storageKey, error },
    );
  }
  if (!grantMayBeLive) {
    await deps.payload.delete({
      collection: "hosted-materials",
      id: material.id,
    });
  }
  return { ok: true };
}
