import { and, eq, inArray } from "drizzle-orm";
import { ValidationError, type Where } from "payload";

import type { db } from "@/server/db";
import { communityMemberships } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";

/**
 * The report rules feed posts and gallery items share (spec 2026-11-13,
 * "Reports and moderation"): what counts as an open report, how a concurrent
 * duplicate shows up, what a restore writes, and who moderates a community.
 * Each report flow keeps its own target, notifications and removal; only
 * these rules live here, so the two flows can't drift apart.
 */

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;
type Database = typeof db;

/** The Payload collections that store member reports. */
export type ReportCollection = "post-reports" | "gallery-reports";

/** Community roles that review reports and get the "reported" notice. */
const MODERATOR_ROLES = ["owner", "admin", "moderator"] as const;

/**
 * Reports a moderator hasn't dismissed yet. A restore dismisses reports
 * instead of deleting them, so the one-report-per-person rule still holds
 * for them; only open reports count toward hiding and show to moderators.
 * `field` is the report's relationship to its target (`post`, `item`).
 */
export function openReportsWhere(field: string, id: number): Where {
  return {
    and: [{ [field]: { equals: id } }, { dismissedAt: { exists: false } }],
  };
}

/**
 * True when creating a report failed on the collection's one-report-per-
 * reporter unique index: a concurrent report by the same person won the
 * race. Every other field is validated before the create, so a
 * ValidationError from that collection can only be that.
 */
export function isDuplicateReportError(
  error: unknown,
  collection: ReportCollection,
): boolean {
  return (
    error instanceof ValidationError && error.data.collection === collection
  );
}

/**
 * What a restore writes to the reported target: shown again, no open
 * reports. Frozen because it is shared; callers pass Payload a copy.
 */
export const RESTORE_PATCH = Object.freeze({
  hiddenAt: null,
  reportCount: 0,
} as const);

/**
 * The target's open reports, counted from storage rather than by adding one
 * to the loaded target, so two reports landing at once can't both write the
 * same number.
 */
export async function countOpenReports(
  payload: Payload,
  collection: ReportCollection,
  field: string,
  id: number,
): Promise<number> {
  const { totalDocs } = await payload.count({
    collection,
    where: openReportsWhere(field, id),
  });
  return totalDocs;
}

/** User ids of the community's active owners, admins and moderators. */
export async function communityModeratorIds(
  database: Database,
  communityId: string,
): Promise<string[]> {
  const rows = await database
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, [...MODERATOR_ROLES]),
      ),
    );
  return rows.map((row) => row.userId);
}
