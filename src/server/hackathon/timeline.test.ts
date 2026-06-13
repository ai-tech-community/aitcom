import { describe, expect, it } from "vitest";

import {
  hackathonTimeline,
  type MilestoneStatus,
  type TimelineMilestone,
} from "@/server/hackathon/timeline";

const ORDER: TimelineMilestone["key"][] = [
  "registration",
  "kickoff",
  "lock",
  "submissions",
  "results",
];

/** Builds a key→status lookup for terse per-milestone assertions. */
function byKey(
  milestones: TimelineMilestone[],
): Record<TimelineMilestone["key"], MilestoneStatus> {
  return Object.fromEntries(milestones.map((m) => [m.key, m.status])) as Record<
    TimelineMilestone["key"],
    MilestoneStatus
  >;
}

describe("hackathonTimeline", () => {
  it("returns the five milestones in a stable order for every phase", () => {
    for (const phase of ["draft", "live", "locked", "finalized"] as const) {
      expect(hackathonTimeline(phase).map((m) => m.key)).toEqual(ORDER);
    }
  });

  it("draft: every milestone is upcoming (defensive — not public)", () => {
    const s = byKey(hackathonTimeline("draft"));
    expect(s).toEqual({
      registration: "upcoming",
      kickoff: "upcoming",
      lock: "upcoming",
      submissions: "upcoming",
      results: "upcoming",
    });
  });

  it("live: registration done, kickoff current, the rest upcoming", () => {
    const s = byKey(hackathonTimeline("live"));
    expect(s).toEqual({
      registration: "done",
      kickoff: "current",
      lock: "upcoming",
      submissions: "upcoming",
      results: "upcoming",
    });
  });

  it("locked: registration+kickoff+lock done, submissions current, results upcoming", () => {
    const s = byKey(hackathonTimeline("locked"));
    expect(s).toEqual({
      registration: "done",
      kickoff: "done",
      lock: "done",
      submissions: "current",
      results: "upcoming",
    });
  });

  it("finalized: every earlier milestone done, results current", () => {
    const s = byKey(hackathonTimeline("finalized"));
    expect(s).toEqual({
      registration: "done",
      kickoff: "done",
      lock: "done",
      submissions: "done",
      results: "current",
    });
  });

  it("has exactly one current milestone in every public phase", () => {
    for (const phase of ["live", "locked", "finalized"] as const) {
      const current = hackathonTimeline(phase).filter(
        (m) => m.status === "current",
      );
      expect(current).toHaveLength(1);
    }
  });
});
