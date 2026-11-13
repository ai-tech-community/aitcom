import { sql } from "@payloadcms/db-postgres";
import { TRPCError } from "@trpc/server";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import {
  GALLERY_REPORT_NOTE_MAX,
  type GalleryReportReason,
} from "@/lib/gallery-report-reasons";
import { clampText } from "@/lib/text-utils";
import type { GalleryItem } from "@/payload-types";
import {
  countOpenReports,
  isDuplicateReportError,
  openReportsWhere,
  RESTORE_PATCH,
} from "@/server/moderation/report-rules";

import type { GalleryViewer } from "./access";
import { nowOf, type GalleryDeps } from "./deps";
import { galleryError } from "./errors";
import {
  findReadableItem,
  removeItem,
  requireReadableItem,
  writeFailed,
} from "./items";

/**
 * Reporting gallery items and reviewing the reports (spec 2026-11-13,
 * Reports and moderation). The rules shared with feed post reports — what
 * an open report is, how a duplicate shows up, what a restore writes —
 * live in `report-rules.ts`; what is the gallery's own lives here: which
 * items a viewer may report, the guarded hide, who is told, and Remove
 * going through the gallery's one removal path (`removeItem`).
 *
 * Who reported never leaves this module.
 */

/** The notices a report sends. Injected, so the rules test without a database. */
export type GalleryReportNotifier = {
  /** The community's moderators: a report hid this item. */
  itemReported(input: { communityId: string; itemId: number }): Promise<void>;
  /** The uploader: someone says they are in it and asked to be removed. */
  uploaderThisIsMe(input: {
    communityId: string;
    itemId: number;
    uploaderId: string;
  }): Promise<void>;
};

export type GalleryReportDeps = GalleryDeps & {
  notify: GalleryReportNotifier;
};

/** What a moderator sees of one report. */
export type GalleryReportView = {
  reason: GalleryReportReason;
  note: string | null;
  createdAt: string;
};

const REPORTS = "gallery-reports";

/**
 * Anyone signed in who may read the item reports it, members or not ("this
 * is me" matters most for people pictured who aren't members); an item they
 * may not read is NOT_FOUND. The uploader can't report their own item
 * (OWN_ITEM: they delete it), and no one reports the same item twice, even
 * after a restore dismissed their report (ALREADY_REPORTED).
 *
 * The first report hides the item through one guarded write, so of two
 * reports landing together exactly one hides it and notifies the
 * moderators; a restore and a new report notify again. "This is me" also
 * tells the uploader, on every such report, unless their account is gone.
 * A notice that fails is logged: the report is stored by then, and a retry
 * would only say ALREADY_REPORTED.
 */
export async function reportItem(
  deps: GalleryReportDeps,
  input: {
    viewer: GalleryViewer;
    itemId: number;
    reason: GalleryReportReason;
    note?: string;
  },
): Promise<{ hidden: true }> {
  const reporterId = input.viewer.userId;
  if (!reporterId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const item = await requireReadableItem(deps, input.viewer, input.itemId);
  if (item.uploaderId === reporterId) throw galleryError("OWN_ITEM");
  await createReport(deps, {
    itemId: item.id,
    reporterId,
    reason: input.reason,
    note: input.note,
  });
  if (await claimHide(deps, item.id)) {
    await notifySafely(deps, "moderator", item, () =>
      deps.notify.itemReported({
        communityId: item.communityId,
        itemId: item.id,
      }),
    );
  }
  if (input.reason === "this_is_me" && item.uploaderId !== DELETED_AUTHOR_ID) {
    await notifySafely(deps, "uploader", item, () =>
      deps.notify.uploaderThisIsMe({
        communityId: item.communityId,
        itemId: item.id,
        uploaderId: item.uploaderId,
      }),
    );
  }
  await saveReportCount(deps, item.id);
  return { hidden: true };
}

/** Stores one report, or refuses a second one by the same person. */
async function createReport(
  deps: GalleryReportDeps,
  report: {
    itemId: number;
    reporterId: string;
    reason: GalleryReportReason;
    note?: string;
  },
): Promise<void> {
  const { docs: existing } = await deps.payload.find({
    collection: REPORTS,
    where: {
      and: [
        { item: { equals: report.itemId } },
        { reporterId: { equals: report.reporterId } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  if (existing.length > 0) throw galleryError("ALREADY_REPORTED");
  try {
    await deps.payload.create({
      collection: REPORTS,
      data: {
        item: report.itemId,
        reporterId: report.reporterId,
        reason: report.reason,
        note:
          clampText(report.note?.trim() ?? "", GALLERY_REPORT_NOTE_MAX) ||
          undefined,
      },
    });
  } catch (error) {
    // A concurrent report by the same person won the unique index.
    if (isDuplicateReportError(error, REPORTS)) {
      throw galleryError("ALREADY_REPORTED");
    }
    throw error;
  }
}

/**
 * Hides the item, only while it is not hidden, in one statement: Payload's
 * own `update` matches its `where` first and writes by id afterwards, so
 * two reports could both see the item shown and both "hide" it. True when
 * this call hid it.
 */
async function claimHide(
  deps: Pick<GalleryDeps, "payload" | "now">,
  itemId: number,
): Promise<boolean> {
  const { rows } = await deps.payload.db.drizzle.execute(sql`
    UPDATE ${sql.identifier("gallery_items")}
      SET ${sql.identifier("hidden_at")} = ${nowOf(deps).toISOString()}, ${sql.identifier("updated_at")} = now()
      WHERE ${sql.identifier("id")} = ${itemId} AND ${sql.identifier("hidden_at")} IS NULL
      RETURNING ${sql.identifier("id")}
  `);
  return rows.length > 0;
}

/**
 * Writes the item's open-report count, counted from storage so reports
 * landing together never write a stale number. Server-side only; a write
 * Payload could not apply is logged (the next report or a restore writes it
 * again).
 */
async function saveReportCount(
  deps: GalleryReportDeps,
  itemId: number,
): Promise<void> {
  const reportCount = await countOpenReports(deps.payload, REPORTS, itemId);
  const { errors } = await deps.payload.update({
    collection: "gallery-items",
    where: { id: { equals: itemId } },
    data: { reportCount },
    depth: 0,
  });
  if (errors.length > 0) {
    (deps.log ?? console.error)(
      "[gallery.reportItem] saving the report count failed",
      { itemId, errors },
    );
  }
}

async function notifySafely(
  deps: Pick<GalleryDeps, "log">,
  recipient: "moderator" | "uploader",
  item: Pick<GalleryItem, "id">,
  send: () => Promise<void>,
): Promise<void> {
  try {
    await send();
  } catch (error) {
    (deps.log ?? console.error)(
      `[gallery.reportItem] ${recipient} notification failed`,
      { itemId: item.id, error },
    );
  }
}

/** Refuses anyone but the community's moderators (NOT_ALLOWED). */
function assertModerator(viewer: GalleryViewer): void {
  if (!viewer.isModerator) throw galleryError("NOT_ALLOWED");
}

/**
 * An item's open reports, newest first, for its community's moderators
 * only — checked first, so no one else can probe whether an item exists.
 */
export async function listItemReports(
  deps: GalleryDeps,
  input: { viewer: GalleryViewer; itemId: number },
): Promise<GalleryReportView[]> {
  assertModerator(input.viewer);
  const item = await requireReadableItem(deps, input.viewer, input.itemId);
  const { docs } = await deps.payload.find({
    collection: REPORTS,
    where: openReportsWhere(REPORTS, item.id),
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

/**
 * A moderator's decision on a reported item. Restore shows it again and
 * dismisses its open reports (kept, so those reporters can't report it
 * again). Remove takes it out of the gallery the way a delete does
 * (`removeItem`), its reports with it. An item that is gone is NOT_FOUND,
 * after clearing any reports it left behind.
 */
export async function reviewItemReports(
  deps: GalleryDeps,
  input: {
    viewer: GalleryViewer;
    itemId: number;
    action: "restore" | "remove";
  },
): Promise<void> {
  assertModerator(input.viewer);
  const item = await findReadableItem(deps, input.viewer, input.itemId);
  if (!item) {
    await clearLeftoverReports(deps, input.itemId);
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (input.action === "remove") {
    await removeItem(deps, item, "reviewItemReports");
    return;
  }
  const dismissed = await deps.payload.update({
    collection: REPORTS,
    where: openReportsWhere(REPORTS, item.id),
    data: { dismissedAt: nowOf(deps).toISOString() },
    depth: 0,
  });
  if (dismissed.errors.length > 0) {
    throw writeFailed(
      deps,
      "[gallery.reviewItemReports] dismissing reports failed",
      item.id,
      dismissed.errors,
    );
  }
  const restored = await deps.payload.update({
    collection: "gallery-items",
    where: { id: { equals: item.id } },
    data: { ...RESTORE_PATCH },
    depth: 0,
  });
  if (restored.errors.length > 0) {
    throw writeFailed(
      deps,
      "[gallery.reviewItemReports] restoring an item failed",
      item.id,
      restored.errors,
    );
  }
  if (restored.docs.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
}

/**
 * Reports of an item that no longer exists at all. The foreign key removes
 * them with the item, so there should be none; an item that exists but is
 * not this moderator's to review (another community's) keeps its reports.
 */
async function clearLeftoverReports(
  deps: Pick<GalleryDeps, "payload">,
  itemId: number,
): Promise<void> {
  const { totalDocs } = await deps.payload.count({
    collection: "gallery-items",
    where: { id: { equals: itemId } },
  });
  if (totalDocs > 0) return;
  await deps.payload.delete({
    collection: REPORTS,
    where: { item: { equals: itemId } },
  });
}
