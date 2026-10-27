import type { Deps } from "./deps";
import { publishDueIssues, type DueRunResult } from "./scheduled-publishing";

export type IssueJobsResult = DueRunResult;

/** The issue lifecycle jobs, in order; later delivery work extends this runner. */
export async function runMagazineIssueJobs(
  deps: Deps,
  opts: { now: Date },
): Promise<IssueJobsResult> {
  return publishDueIssues(deps, opts.now);
}
