// People's Choice — the community vote on submitted gallery projects (#169).
// Pure window + winner rules, db-free so they are unit-testable. Deliberately
// NON-SCORING (ADR-0029 stays intact): this module must never import
// scoring.ts and its output never feeds cell-weight scores, finalRank, or
// prizes — it is a parallel recognition award only (a test pins the no-import
// guarantee). One-vote-per-member uniqueness is structural: the DB enforces a
// unique (challenge_id, user_id) index and the cast mutation UPSERTs on it.

import type { HackathonPhase } from "./phase";

/**
 * Voting window follows the hackathon lifecycle: opens when rosters lock
 * (projects start existing) and closes at finalize. After that the winner is
 * recomputed per request from the now-stable votes table, not stored.
 */
export function votingOpen(phase: HackathonPhase): boolean {
  return phase === "locked";
}

export interface PeoplesChoiceEntry {
  teamId: string;
  votes: number;
  /** ISO string or Date — tolerant of RSC/tRPC serialization like gallery.ts. */
  submittedAt: Date | string | null;
}

function submittedMillis(value: Date | string | null): number {
  // Missing submission time = latest, i.e. least preferred in the tiebreak.
  if (value === null) return Number.MAX_SAFE_INTEGER;
  return new Date(value).getTime();
}

/**
 * The People's Choice winner: most votes; ties break to the earliest
 * submittedAt (rewarding the team whose project stood in the gallery longest),
 * then to teamId so the pick is total and deterministic regardless of input
 * order. Null when nobody voted — the award simply isn't given.
 */
export function peoplesChoice(entries: PeoplesChoiceEntry[]): string | null {
  const voted = entries.filter((e) => e.votes > 0);
  if (voted.length === 0) return null;

  const [top] = [...voted].sort(
    (a, b) =>
      b.votes - a.votes ||
      submittedMillis(a.submittedAt) - submittedMillis(b.submittedAt) ||
      (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0),
  );
  return top!.teamId;
}
