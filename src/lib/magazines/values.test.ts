import { describe, expect, it } from "vitest";

import {
  canIssue,
  ISSUE_LAYOUTS,
  ISSUE_LAYOUT_LABELS,
  ISSUE_STATUSES,
  ISSUE_TRANSITIONS,
  ISSUE_VISIBILITIES,
  ISSUE_VISIBILITY_LABELS,
  PUBLISH_ORIGINS,
  SCHEDULE_ORIGINS,
} from "./values";

describe("issue lifecycle", () => {
  it("offers all three layouts with everyday labels", () => {
    expect(ISSUE_LAYOUTS).toEqual(["cover-story", "long-read", "digest"]);
    expect(ISSUE_LAYOUT_LABELS).toEqual({
      "cover-story": "Cover story",
      "long-read": "Long read",
      digest: "Digest",
    });
  });
  it("offers preview between members and public", () => {
    expect(ISSUE_VISIBILITIES).toEqual(["members", "teaser", "public"]);
    expect(ISSUE_VISIBILITY_LABELS.teaser).toBe("Preview for everyone");
  });
  it("automatic schedules are a kind of publish origin", () => {
    expect(PUBLISH_ORIGINS).toEqual(["button", "schedule", "auto"]);
    for (const origin of SCHEDULE_ORIGINS) {
      expect(PUBLISH_ORIGINS).toContain(origin);
    }
  });

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
