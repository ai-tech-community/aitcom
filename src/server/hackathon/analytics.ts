// Pure aggregation math for the organizer analytics funnel on the manage page
// (#165): raw counts in → funnel stages / completion buckets with conversion
// rates out. The db queries live in the hackathon router; this module is
// db-free + deterministic so the rate semantics (including division-by-zero
// guards) can be unit-tested in isolation, consistent with phase.ts/winners.ts.

export interface FunnelCounts {
  /** Enrollments in the hackathon challenge. */
  enrolled: number;
  /** Enrollments that joined a team (teamId set). */
  teamed: number;
  /** Enrollments whose team has submitted. */
  inSubmittedTeams: number;
}

export interface FunnelStage {
  count: number;
  /** Conversion from the previous stage, 0..1; null when that stage is empty. */
  rate: number | null;
}

export interface ParticipationFunnel {
  enrolled: { count: number };
  teamed: FunnelStage;
  submitted: FunnelStage;
}

function ratio(count: number, denominator: number): number | null {
  return denominator > 0 ? count / denominator : null;
}

/** Enrollment → teamed → submitted, with stage-over-previous conversion. */
export function participationFunnel(counts: FunnelCounts): ParticipationFunnel {
  return {
    enrolled: { count: counts.enrolled },
    teamed: {
      count: counts.teamed,
      rate: ratio(counts.teamed, counts.enrolled),
    },
    submitted: {
      count: counts.inSubmittedTeams,
      rate: ratio(counts.inSubmittedTeams, counts.teamed),
    },
  };
}

/** Cell status buckets (see workCells.status); absent buckets count as 0. */
export type CellStatusCounts = Partial<
  Record<"pending" | "claimed" | "completed" | "failed" | "requeued", number>
>;

export interface CompletionBucket {
  count: number;
  /** Share of all cells, 0..1; null when there are no cells yet (pre-lock). */
  rate: number | null;
}

export interface CellCompletion {
  total: number;
  /** Ever claimed: currently claimed or already reported (completed|failed). */
  claimed: CompletionBucket;
  /** A result was reported: completed (awaiting/verified) or failed. */
  reported: CompletionBucket;
  /** Cells with a VERIFIED result — same definition finalize scores by. */
  verified: CompletionBucket;
}

/**
 * Cumulative work-progress buckets across all of a hackathon's competitive
 * grids. `requeued` cells lost their claim (deadline expiry) and are claimable
 * again, so they count as un-claimed — mirroring cellHeatState's fold of
 * requeued back to pending.
 */
export function cellCompletion(
  byStatus: CellStatusCounts,
  verifiedCount: number,
): CellCompletion {
  const n = (k: keyof CellStatusCounts) => byStatus[k] ?? 0;
  const total =
    n("pending") + n("claimed") + n("completed") + n("failed") + n("requeued");
  const reported = n("completed") + n("failed");
  const claimed = n("claimed") + reported;
  return {
    total,
    claimed: { count: claimed, rate: ratio(claimed, total) },
    reported: { count: reported, rate: ratio(reported, total) },
    verified: { count: verifiedCount, rate: ratio(verifiedCount, total) },
  };
}
