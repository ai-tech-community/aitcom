import { describe, it, expect } from "vitest";

import {
  TASK_PROGRESS_STATUSES,
  isTaskProgressStatus,
  canEditCellProgress,
} from "./task-progress";

describe("TASK_PROGRESS_STATUSES", () => {
  it("is the kanban vocabulary in board order", () => {
    expect(TASK_PROGRESS_STATUSES).toEqual([
      "todo",
      "in_progress",
      "blocked",
      "done",
    ]);
  });
});

describe("isTaskProgressStatus", () => {
  it("accepts every valid status", () => {
    for (const s of TASK_PROGRESS_STATUSES) {
      expect(isTaskProgressStatus(s)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const s of [
      "",
      "TODO",
      "done ",
      "verified",
      "claimed",
      null,
      undefined,
      3,
    ]) {
      expect(isTaskProgressStatus(s)).toBe(false);
    }
  });
});

describe("canEditCellProgress", () => {
  it("lets the cell's current claimant edit", () => {
    expect(
      canEditCellProgress({
        userId: "u1",
        captainId: "cap",
        claimedByUserId: "u1",
      }),
    ).toBe(true);
  });

  it("lets the team captain edit even an unclaimed cell", () => {
    expect(
      canEditCellProgress({
        userId: "cap",
        captainId: "cap",
        claimedByUserId: null,
      }),
    ).toBe(true);
  });

  it("blocks a non-claimant non-captain team member", () => {
    expect(
      canEditCellProgress({
        userId: "u2",
        captainId: "cap",
        claimedByUserId: "u1",
      }),
    ).toBe(false);
  });

  it("blocks a member on an unclaimed cell when they are not captain", () => {
    expect(
      canEditCellProgress({
        userId: "u2",
        captainId: "cap",
        claimedByUserId: null,
      }),
    ).toBe(false);
  });
});
