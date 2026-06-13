// Derives the hackathon lifecycle phase (draft → live → locked → finalized)
// from server truth, so a page reload can never resurrect an earlier phase:
// publishing flips the Event off "draft", lockRosters flips teams to status
// "locked", and finalize stamps finalRank/prizeAwardedAt on teams (the
// challenge status itself stays "active" today — "completed" is accepted as a
// finalize marker for forward-compatibility). Db-free + deterministic so it can
// be unit-tested in isolation and shared by the manage and winners pages.

export type HackathonPhase =
  | "draft"
  | "live"
  | "locked"
  | "judging"
  | "finalized";

export interface TeamPhaseMarkers {
  status: string;
  finalRank: number | null;
  prizeAwardedAt: Date | null;
}

export function hackathonPhase(args: {
  eventStatus: string;
  challengeStatus: string;
  judgingOpenedAt: Date | string | null;
  teams: TeamPhaseMarkers[];
}): HackathonPhase {
  // Cancelled/rejected events must never read as live (or any later phase):
  // they collapse to "draft", the closed/not-public phase, matching the
  // ["draft", "rejected", "cancelled"] gate used elsewhere in the codebase.
  if (["draft", "rejected", "cancelled"].includes(args.eventStatus)) {
    return "draft";
  }
  const finalized =
    args.challengeStatus === "completed" ||
    args.teams.some((t) => t.finalRank !== null || t.prizeAwardedAt !== null);
  if (finalized) return "finalized";
  if (args.teams.some((t) => t.status === "locked")) {
    // Once an organizer opens judging on a locked-but-not-finalized hackathon,
    // it advances to "judging" (gates judge ranking). Finalize still wins above.
    return args.judgingOpenedAt !== null ? "judging" : "locked";
  }
  return "live";
}
