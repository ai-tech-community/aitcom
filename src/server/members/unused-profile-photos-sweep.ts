import { sql } from "drizzle-orm";

import { type db } from "@/server/db";
import type { getPayloadClient } from "@/server/payload";

import { profilePhotoLock } from "./profile-photo";

type Database = typeof db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A profile photo younger than this may still be on its way to its
 * member's picture (uploaded, not yet settled), so it is never swept.
 */
export const UNUSED_PROFILE_PHOTO_MIN_AGE_HOURS = 1;

/** Photos read per query; the oldest go first. */
const SWEEP_PAGE_SIZE = 200;
/** Pages per run, so one run stays well inside the cron's time limit. */
const SWEEP_MAX_PAGES = 10;

/**
 * Deletes profile photos no member shows: ones whose delete failed when
 * their member replaced or removed them, or deleted their account. Only
 * uploads with the `avatar` purpose are considered. Each photo is checked
 * again under its member's lock right before it is deleted, so a photo
 * that has just become the member's picture is never taken. Deleting a
 * media document also deletes its files.
 */
export async function sweepUnusedProfilePhotos(deps: {
  db: Database;
  payload: Payload;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
}): Promise<{ removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(
    now.getTime() - UNUSED_PROFILE_PHOTO_MIN_AGE_HOURS * 60 * 60 * 1000,
  );
  let removed = 0;
  let failed = 0;
  const failedIds: number[] = [];
  for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
    const unused = await unusedPhotos(deps.db, cutoff, failedIds);
    for (const photo of unused) {
      try {
        const deleted = await deps.db.transaction(async (tx) => {
          await tx.execute(profilePhotoLock(photo.uploadedBy));
          const [still] = await unusedPhotos(tx, cutoff, [], photo.id);
          if (!still) return false;
          await deps.payload.delete({ collection: "media", id: photo.id });
          return true;
        });
        if (deleted) removed++;
      } catch (error) {
        failed++;
        failedIds.push(photo.id);
        (deps.log ?? console.error)("[unused-profile-photos] removal failed", {
          mediaId: photo.id,
          error,
        });
      }
    }
    if (unused.length < SWEEP_PAGE_SIZE) break;
  }
  return { removed, failed };
}

type Executor = Pick<Database, "execute">;

/**
 * Old profile photos their uploader does not show (or whose uploader is
 * gone), oldest first; with `onlyId`, just that photo if it still is one.
 * A member's picture is the photo's square crop or, for a picture smaller
 * than the crop, the photo itself.
 */
async function unusedPhotos(
  executor: Executor,
  cutoff: Date,
  skip: readonly number[],
  onlyId?: number,
): Promise<{ id: number; uploadedBy: string }[]> {
  const { rows } = await executor.execute(sql`
    SELECT m."id", m."uploaded_by" FROM "media" m
    LEFT JOIN "app"."user" u ON u."id" = m."uploaded_by"
    WHERE m."purpose" = 'avatar'
      AND m."created_at" < ${cutoff.toISOString()}
      AND (
        u."image" IS NULL
        OR (
          u."image" IS DISTINCT FROM m."sizes_thumbnail_url"
          AND u."image" IS DISTINCT FROM m."url"
        )
      )
      ${onlyId === undefined ? sql`` : sql`AND m."id" = ${onlyId}`}
      ${skip.length > 0 ? sql`AND m."id" NOT IN ${skip}` : sql``}
    ORDER BY m."created_at"
    LIMIT ${SWEEP_PAGE_SIZE}
  `);
  return rows.map((row) => {
    const { id, uploaded_by } = row as { id: unknown; uploaded_by: unknown };
    return { id: Number(id), uploadedBy: String(uploaded_by) };
  });
}
