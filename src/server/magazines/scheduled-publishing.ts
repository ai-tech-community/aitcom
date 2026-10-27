import { eq } from "drizzle-orm";

import type { MagazineIssue } from "@/payload-types";
import { communities } from "@/server/db/schema";

import type { Deps } from "./deps";
import {
  listMagazineEditorIds,
  loadMagazineEditorship,
  standingCan,
} from "./editorship";
import { magazineErrorCodeOf } from "./errors";
import {
  isItemProblemCode,
  publishIssue,
  unscheduleIssue,
} from "./issue-service";
import { notifyScheduleFailed, type ScheduleFailure } from "./notifications";
import { isConcurrencyAbort } from "./payload-writes";
import { requireRelationId } from "./relation-id";

export const DUE_BATCH = 20;
export const SCHEDULE_RETRY_LIMIT_MINUTES = 60;

export type DueRunResult = {
  published: number;
  failed: number;
  retried: number;
};

/** Only a successful claim returns to draft and earns a failure notice. */
async function failSchedule(
  deps: Deps,
  issue: MagazineIssue,
  reason: ScheduleFailure | null,
): Promise<boolean> {
  try {
    await unscheduleIssue(deps, issue, issue.updatedAt, null);
  } catch (error) {
    const code = magazineErrorCodeOf(error);
    if (code !== "ISSUE_CHANGED" && code !== "ISSUE_NOT_SCHEDULED") {
      console.error("[magazine-issues] unschedule failed", {
        issueId: issue.id,
        error,
      });
    }
    return false;
  }

  if (reason !== null) {
    try {
      const community = await deps.db.query.communities.findFirst({
        where: eq(communities.id, issue.communityId),
      });
      if (!community || community.deletedAt) return true;
      const magazineId = requireRelationId(issue.magazine);
      const magazine = await deps.payload.findByID({
        collection: "magazines",
        id: magazineId,
        depth: 0,
      });
      await notifyScheduleFailed(deps.db, {
        editorIds: await listMagazineEditorIds(deps.db, {
          communityId: issue.communityId,
          magazineId,
        }),
        reason,
        issue,
        magazineName: magazine.name,
        community,
      });
    } catch (error) {
      console.error("[magazine-issues] failure notice failed", {
        issueId: issue.id,
        error,
      });
    }
  }
  return true;
}

/** Retry transient failures, then return to draft once the scheduled time is over an hour ago. */
async function retrySchedule(
  deps: Deps,
  issue: MagazineIssue,
  now: Date,
  error: unknown,
): Promise<keyof DueRunResult> {
  console.error("[magazine-issues] publish failed", {
    issueId: issue.id,
    error,
  });
  if (
    now.getTime() - new Date(issue.scheduledFor!).getTime() >
    SCHEDULE_RETRY_LIMIT_MINUTES * 60_000
  ) {
    return (await failSchedule(deps, issue, "error")) ? "failed" : "retried";
  }
  return "retried";
}

async function publishDueIssue(
  deps: Deps,
  issue: MagazineIssue,
  now: Date,
): Promise<keyof DueRunResult> {
  try {
    const community = await deps.db.query.communities.findFirst({
      where: eq(communities.id, issue.communityId),
    });
    if (!community || community.deletedAt) {
      return (await failSchedule(deps, issue, null)) ? "failed" : "retried";
    }
    const standing = await loadMagazineEditorship(
      deps.db,
      {
        communityId: issue.communityId,
        magazineId: requireRelationId(issue.magazine),
      },
      issue.scheduledBy ?? null,
    );
    if (!issue.scheduledBy || !standingCan(standing, "edit")) {
      return (await failSchedule(deps, issue, "no_rights"))
        ? "failed"
        : "retried";
    }
    await publishIssue(
      deps,
      issue,
      issue.updatedAt,
      { userId: issue.scheduledBy, community },
      { origin: "schedule", now },
    );
    return "published";
  } catch (error) {
    const code = magazineErrorCodeOf(error);
    if (!isConcurrencyAbort(error)) {
      if (code === "ISSUE_EMPTY") {
        return (await failSchedule(deps, issue, "empty"))
          ? "failed"
          : "retried";
      }
      if (code !== null && isItemProblemCode(code)) {
        return (await failSchedule(deps, issue, "invalid_item"))
          ? "failed"
          : "retried";
      }
    }
    return retrySchedule(deps, issue, now, error);
  }
}

/** Oldest due schedules first, through the same publishing path as the editor. */
export async function publishDueIssues(
  deps: Deps,
  now: Date,
): Promise<DueRunResult> {
  const { docs } = await deps.payload.find({
    collection: "magazine-issues",
    where: {
      and: [
        { status: { equals: "scheduled" } },
        { scheduledFor: { less_than_equal: now.toISOString() } },
      ],
    },
    sort: "scheduledFor",
    limit: DUE_BATCH,
    depth: 0,
  });
  const result: DueRunResult = { published: 0, failed: 0, retried: 0 };
  for (const issue of docs) result[await publishDueIssue(deps, issue, now)]++;
  return result;
}
