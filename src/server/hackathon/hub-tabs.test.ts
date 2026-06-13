import { describe, it, expect } from "vitest";

import { HUB_TAB_ORDER, hubTabStates, type HubViewerContext } from "./hub-tabs";

function ctx(overrides: Partial<HubViewerContext> = {}): HubViewerContext {
  return {
    phase: "live",
    isEnrolled: false,
    isOnLockedTeam: false,
    ...overrides,
  };
}

function state(key: string, states = hubTabStates(ctx())) {
  return states.find((s) => s.key === key)!;
}

describe("HUB_TAB_ORDER", () => {
  it("lists the 8 tabs in display order", () => {
    expect(HUB_TAB_ORDER).toEqual([
      "overview",
      "timeline",
      "projects",
      "participants",
      "team",
      "workspace",
      "agents",
      "winners",
    ]);
  });
});

describe("hubTabStates", () => {
  it("returns one entry per tab, in order", () => {
    expect(hubTabStates(ctx()).map((s) => s.key)).toEqual(HUB_TAB_ORDER);
  });

  it("always makes overview, timeline, participants, agents available", () => {
    for (const phase of ["live", "locked", "finalized"] as const) {
      const states = hubTabStates(ctx({ phase }));
      for (const key of ["overview", "timeline", "participants", "agents"]) {
        expect(state(key, states).available).toBe(true);
        expect(state(key, states).lockedReasonKey).toBeNull();
      }
    }
  });

  it("locks projects in live with a pre-lock reason, opens it at lock", () => {
    expect(state("projects", hubTabStates(ctx({ phase: "live" }))).available).toBe(false);
    expect(state("projects", hubTabStates(ctx({ phase: "live" }))).lockedReasonKey).toBe(
      "lockedProjectsPreLock",
    );
    expect(state("projects", hubTabStates(ctx({ phase: "locked" }))).available).toBe(true);
    expect(state("projects", hubTabStates(ctx({ phase: "finalized" }))).available).toBe(true);
  });

  it("locks My Team for a non-enrolled viewer, opens it once enrolled", () => {
    expect(state("team", hubTabStates(ctx({ isEnrolled: false }))).available).toBe(false);
    expect(state("team", hubTabStates(ctx({ isEnrolled: false }))).lockedReasonKey).toBe(
      "lockedTeamNotEnrolled",
    );
    expect(state("team", hubTabStates(ctx({ isEnrolled: true }))).available).toBe(true);
  });

  it("locks Workspace unless the viewer is on a locked team", () => {
    expect(state("workspace", hubTabStates(ctx({ isOnLockedTeam: false }))).available).toBe(false);
    expect(state("workspace", hubTabStates(ctx({ isOnLockedTeam: false }))).lockedReasonKey).toBe(
      "lockedWorkspaceNotReady",
    );
    expect(state("workspace", hubTabStates(ctx({ isOnLockedTeam: true }))).available).toBe(true);
  });

  it("locks Winners until finalized", () => {
    expect(state("winners", hubTabStates(ctx({ phase: "locked" }))).available).toBe(false);
    expect(state("winners", hubTabStates(ctx({ phase: "locked" }))).lockedReasonKey).toBe(
      "lockedWinnersPending",
    );
    expect(state("winners", hubTabStates(ctx({ phase: "finalized" }))).available).toBe(true);
  });
});
