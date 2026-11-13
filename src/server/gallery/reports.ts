import { sql } from "@payloadcms/db-postgres";
import { TRPCError } from "@trpc/server";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import {
  GALLERY_REPORT_NOTE_MAX,
  GALLERY_REVIEW_REPORTS_MAX,
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

/**
 * What a moderator sees of one report. The report's own id travels, so a
 * restore can name exactly the reports it was decided on; who reported
 * never does.
 */
export type GalleryReportView = {
  id: number;
  reason: GalleryReportReason;
  note: string | null;
  createdAt: string;
};

/** An item's open reports as a moderator read them. */
export type GalleryReportList = { reports: GalleryReportView[] };

/** A moderator's decision on a reported item. */
export type GalleryReview =
  | { action: "remove" }
  | { action: "restore"; reviewedReportIds: readonly number[] };

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
 *
 * A request that stored its report but failed before the hide is finished
 * by the reporter's retry (`fileReport`): their report is still open and
 * the item still shows, so the hide and the notices run as the first
 * attempt would have, from the stored report. A notice that fails is only
 * logged: by then the item is hidden, and a retry would say
 * ALREADY_REPORTED.
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
  const { reason } = await fileReport(deps, item, {
    reporterId,
    reason: input.reason,
    note: input.note,
  });
  await hideAndNotify(deps, item, "reportItem");
  if (reason === "this_is_me" && item.uploaderId !== DELETED_AUTHOR_ID) {
    await notifySafely(deps, "reportItem", "uploader", item, () =>
      deps.notify.uploaderThisIsMe({
        communityId: item.communityId,
        itemId: item.id,
        uploaderId: item.uploaderId,
      }),
    );
  }
  await saveReportCount(
    deps,
    item.id,
    await countOpenReports(deps.payload, REPORTS, item.id),
    "reportItem",
  );
  return { hidden: true };
}

/**
 * The report this request acts on: a new one, stored; or the reporter's
 * earlier one, when that request stored it and then failed before the hide
 * (it is still open and the item still shows), so the caller finishes it.
 * Any other second report by the same person is refused
 * (ALREADY_REPORTED): one a restore dismissed, or one that already hid the
 * item.
 */
async function fileReport(
  deps: GalleryReportDeps,
  item: Pick<GalleryItem, "id" | "hiddenAt">,
  report: {
    reporterId: string;
    reason: GalleryReportReason;
    note?: string;
  },
): Promise<{ reason: GalleryReportReason }> {
  const {
    docs: [existing],
  } = await deps.payload.find({
    collection: REPORTS,
    where: {
      and: [
        { item: { equals: item.id } },
        { reporterId: { equals: report.reporterId } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  if (existing) {
    if (existing.dismissedAt == null && item.hiddenAt == null) {
      return { reason: existing.reason };
    }
    throw galleryError("ALREADY_REPORTED");
  }
  try {
    await deps.payload.create({
      collection: REPORTS,
      data: {
        item: item.id,
        reporterId: report.reporterId,
        reason: report.reason,
        note:
          clampText(report.note?.trim() ?? "", GALLERY_REPORT_NOTE_MAX) ||
          undefined,
      },
    });
  } catch (error) {
    // A concurrent report by the same person won the unique index; that
    // request hides the item.
    if (isDuplicateReportError(error, REPORTS)) {
      throw galleryError("ALREADY_REPORTED");
    }
    throw error;
  }
  return { reason: report.reason };
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
 * Hides the item (`claimHide`) and, when this call is the one that hid it,
 * tells the community's moderators — once per hide, whichever of a report
 * or a restore with reports still open got there first.
 */
async function hideAndNotify(
  deps: GalleryReportDeps,
  item: Pick<GalleryItem, "id" | "communityId">,
  context: string,
): Promise<void> {
  if (!(await claimHide(deps, item.id))) return;
  await notifySafely(deps, context, "moderator", item, () =>
    deps.notify.itemReported({
      communityId: item.communityId,
      itemId: item.id,
    }),
  );
}

/**
 * Writes the item's open-report count, counted from storage by the caller
 * just before. Count-then-write is not atomic, so two reports landing
 * together may write the same number; a later report or restore corrects
 * it. Server-side only: a write Payload could not apply is logged, not
 * thrown.
 */
async function saveReportCount(
  deps: Pick<GalleryDeps, "payload" | "log">,
  itemId: number,
  reportCount: number,
  context: string,
): Promise<void> {
  const { errors } = await deps.payload.update({
    collection: "gallery-items",
    where: { id: { equals: itemId } },
    data: { reportCount },
    depth: 0,
  });
  if (errors.length > 0) {
    (deps.log ?? console.error)(
      `[gallery.${context}] saving the report count failed`,
      { itemId, errors },
    );
  }
}

/** Sends a notice; a failure is logged, never passed on. */
async function notifySafely(
  deps: Pick<GalleryDeps, "log">,
  context: string,
  recipient: "moderator" | "uploader",
  item: Pick<GalleryItem, "id">,
  send: () => Promise<void>,
): Promise<void> {
  try {
    await send();
  } catch (error) {
    (deps.log ?? console.error)(
      `[gallery.${context}] ${recipient} notification failed`,
      { itemId: item.id, error },
    );
  }
}

/** Refuses anyone but the community's moderators (NOT_ALLOWED). */
function assertModerator(viewer: GalleryViewer): void {
  if (!viewer.isModerator) throw galleryError("NOT_ALLOWED");
}

/**
 * An item's open reports, newest first (at most
 * `GALLERY_REVIEW_REPORTS_MAX`), for its community's moderators only —
 * checked first, so no one else can probe whether an item exists.
 */
export async function listItemReports(
  deps: GalleryDeps,
  input: { viewer: GalleryViewer; itemId: number },
): Promise<GalleryReportList> {
  assertModerator(input.viewer);
  const item = await requireReadableItem(deps, input.viewer, input.itemId);
  const { docs } = await deps.payload.find({
    collection: REPORTS,
    where: openReportsWhere(REPORTS, item.id),
    sort: "-createdAt",
    limit: GALLERY_REVIEW_REPORTS_MAX,
    pagination: false,
    depth: 0,
  });
  return {
    reports: docs.map((report) => ({
      id: report.id,
      reason: report.reason,
      note: report.note ?? null,
      createdAt: report.createdAt,
    })),
  };
}

/**
 * A moderator's decision on a reported item. Remove takes it out of the
 * gallery the way a delete does (`removeItem`), its reports with it.
 * Restore (`restoreItem`) shows it again. An item that is gone is
 * NOT_FOUND, after clearing any reports it left behind.
 */
export async function reviewItemReports(
  deps: GalleryReportDeps,
  input: { viewer: GalleryViewer; itemId: number } & GalleryReview,
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
  await restoreItem(deps, item, input.reviewedReportIds);
}

/**
 * Dismisses exactly the reports the moderator read (`reviewedReportIds`,
 * from `listItemReports`) that are still open and are this item's — any
 * other id is ignored — and shows the item. Dismissed reports are kept, so
 * those reporters can't report again. A report the moderator did not see
 * — made after the read, or while this restore ran and so unable to hide
 * an item that was still hidden — stays open: once the item is shown, any
 * open report hides it again through the same guarded write, and the
 * moderators are told, so a report is never left open on a shown item.
 */
async function restoreItem(
  deps: GalleryReportDeps,
  item: GalleryItem,
  reviewedReportIds: readonly number[],
): Promise<void> {
  const dismissed = await deps.payload.update({
    collection: REPORTS,
    where: {
      and: [
        openReportsWhere(REPORTS, item.id),
        { id: { in: [...reviewedReportIds] } },
      ],
    },
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
  const stillOpen = await countOpenReports(deps.payload, REPORTS, item.id);
  if (stillOpen === 0) return;
  await hideAndNotify(deps, item, "reviewItemReports");
  await saveReportCount(deps, item.id, stillOpen, "reviewItemReports");
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
