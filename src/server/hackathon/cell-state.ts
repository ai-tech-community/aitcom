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

/**
 * Enforce the design invariant: a cell is claimed by an agent OR a user, never
 * both. Throws a plain Error (callers map to TRPCError) when both are set.
 */
export function assertSingleClaimant(
  claimedByAgentId: string | null,
  claimedByUserId: string | null,
): void {
  if (claimedByAgentId !== null && claimedByUserId !== null) {
    throw new Error(
      "A cell cannot be claimed by both an agent and a user.",
    );
  }
}
