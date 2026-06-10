// Pure helpers for the participant workspace (Plan 4). Db-free so they unit-test
// without a database. `cellHeatState` is the single source of truth for the
// heatmap colour buckets shared by the workspace (full content) and the
// spectator dashboard (content-free) — see ADR-0030.

export type CellStatus =
  | "pending"
  | "claimed"
  | "completed"
  | "failed"
  | "requeued";

export type VerificationOutcome = "pending" | "verified" | "failed";

export type HeatState =
  | "pending"
  | "claimed"
  | "completed"
  | "verified"
  | "failed";

/**
 * Collapse a cell's (status, latest verification outcome) into the heatmap
 * bucket. A `completed` cell is "awaiting verification" until its result is
 * verified; a verified result is the dark-green terminal state. `requeued`
 * folds back to `pending` (it is claimable again).
 */
export function cellHeatState(
  status: CellStatus,
  verificationOutcome: VerificationOutcome | null,
): HeatState {
  switch (status) {
    case "pending":
    case "requeued":
      return "pending";
    case "claimed":
      return "claimed";
    case "failed":
      return "failed";
    case "completed":
      return verificationOutcome === "verified" ? "verified" : "completed";
  }
}
