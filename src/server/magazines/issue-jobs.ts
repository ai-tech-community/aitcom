import {
  deliverPendingAnnouncements,
  type DeliveryResult,
} from "./announcements";
import { runDueAutoDrafts } from "./auto-draft/drafter";
import type { Deps } from "./deps";
import { publishDueIssues, type DueRunResult } from "./scheduled-publishing";
import type { MagazineMailer } from "./subscriptions/mail";
import { purgeUnconfirmedSubscriptions } from "./subscriptions/service";

export type IssueJobsResult = DueRunResult &
  DeliveryResult & { purged: number; drafted: number; skipped: number };

/** Independent steps keep one failure from skipping the rest of the lifecycle. */
export async function runMagazineIssueJobs(
  deps: Deps,
  opts: { now: Date; mailer: MagazineMailer },
): Promise<IssueJobsResult> {
  const result: IssueJobsResult = {
    drafted: 0,
    skipped: 0,
    published: 0,
    failed: 0,
    retried: 0,
    purged: 0,
    inbox: 0,
    email: 0,
    completed: 0,
  };
  try {
    Object.assign(result, await runDueAutoDrafts(deps, opts.now));
  } catch (error) {
    console.error("[magazines] automatic drafts failed", { error });
  }
  try {
    Object.assign(result, await publishDueIssues(deps, opts.now));
  } catch (error) {
    console.error("[magazines] scheduled publishing failed", { error });
  }
  try {
    result.purged = await purgeUnconfirmedSubscriptions(deps.db, opts.now);
  } catch (error) {
    console.error("[magazines] subscription cleanup failed", { error });
  }
  try {
    Object.assign(
      result,
      await deliverPendingAnnouncements(deps, opts.mailer, opts.now),
    );
  } catch (error) {
    console.error("[magazines] announcement delivery failed", { error });
  }
  return result;
}
