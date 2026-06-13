// Maps the hackathon lifecycle phase to an ordered list of timeline milestones
// with a done/current/upcoming status, so the Timeline hub tab can render a
// progress rail without re-deriving the phase. Db-free + deterministic so it is
// unit-tested in isolation, mirroring the other hackathon helpers.

import type { HackathonPhase } from "@/server/hackathon/phase";

export type MilestoneStatus = "done" | "current" | "upcoming";

export interface TimelineMilestone {
  key: "registration" | "kickoff" | "lock" | "submissions" | "results";
  status: MilestoneStatus;
}

/** The fixed, ordered spine of the timeline — index drives the rail layout. */
const MILESTONE_KEYS: TimelineMilestone["key"][] = [
  "registration",
  "kickoff",
  "lock",
  "submissions",
  "results",
];

// The "current" milestone per phase (its predecessors are done, successors
// upcoming). draft has no current marker — defensively all upcoming, since the
// hackathon is not yet public.
const CURRENT_BY_PHASE: Record<
  HackathonPhase,
  TimelineMilestone["key"] | null
> = {
  draft: null,
  live: "kickoff",
  locked: "submissions",
  // Judging deliberates over the submitted projects toward results — the
  // submissions milestone stays "current" until finalize stamps results.
  judging: "submissions",
  finalized: "results",
};

/**
 * Maps the current phase to the ordered milestones with their status.
 * Mapping:
 *  - live      → registration done, kickoff current, rest upcoming
 *  - locked    → registration+kickoff+lock done, submissions current, results upcoming
 *  - finalized → all earlier done, results current
 *  - draft     → all upcoming (not public, but handled defensively)
 */
export function hackathonTimeline(phase: HackathonPhase): TimelineMilestone[] {
  const current = CURRENT_BY_PHASE[phase];
  const currentIndex = current === null ? -1 : MILESTONE_KEYS.indexOf(current);

  return MILESTONE_KEYS.map((key, index) => {
    let status: MilestoneStatus;
    if (currentIndex === -1) {
      status = "upcoming";
    } else if (index < currentIndex) {
      status = "done";
    } else if (index === currentIndex) {
      status = "current";
    } else {
      status = "upcoming";
    }
    return { key, status };
  });
}
