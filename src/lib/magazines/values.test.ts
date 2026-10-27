import { describe, expect, it } from "vitest";

import { canIssue, ISSUE_STATUSES, ISSUE_TRANSITIONS } from "./values";

describe("issue lifecycle", () => {
  it("an issue's next steps come from one table", () => {
    expect(canIssue("draft", "publish")).toBe(true);
    expect(canIssue("scheduled", "publish")).toBe(true);
    expect(canIssue("scheduled", "unschedule")).toBe(true);
    expect(canIssue("draft", "unschedule")).toBe(false);
    expect(canIssue("scheduled", "delete")).toBe(false);
    expect(canIssue("published", "publish")).toBe(false);
    expect(Object.keys(ISSUE_TRANSITIONS)).toEqual([...ISSUE_STATUSES]);
  });
});
