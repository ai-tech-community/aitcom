// Manual, kanban-style progress status for a work cell — informational only,
// orthogonal to the verification pipeline that drives scoring (ADR-0029). A
// cell marked "done" here still needs a reported result that gets verified
// before it counts. Db-free + deterministic so it can be unit-tested and
// shared by the team-workspace mutation and the workspace board UI.

export const TASK_PROGRESS_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
] as const;

export type TaskProgressStatus = (typeof TASK_PROGRESS_STATUSES)[number];

export function isTaskProgressStatus(x: unknown): x is TaskProgressStatus {
  return (
    typeof x === "string" &&
    (TASK_PROGRESS_STATUSES as readonly string[]).includes(x)
  );
}

/**
 * Who may change a cell's manual progress status. Caller is assumed already
 * verified as a team member; this narrows to the cell's current claimant or
 * the team captain (so the captain can coordinate even unclaimed cells).
 */
export function canEditCellProgress(args: {
  userId: string;
  captainId: string;
  claimedByUserId: string | null;
}): boolean {
  return args.userId === args.captainId || args.userId === args.claimedByUserId;
}
