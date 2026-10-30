import { describe, expect, it } from "vitest";

import { parseIssueId } from "./parse-issue-id";

describe("parseIssueId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ] as const)("accepts %s", (raw, expected) => {
    expect(parseIssueId(raw)).toBe(expected);
  });
  it.each([
    "",
    "0",
    "01",
    "-1",
    "1.2",
    "1e2",
    "+1",
    " 1",
    "1x",
    "9007199254740992",
  ])("refuses %s", (raw) => {
    expect(parseIssueId(raw)).toBeNull();
  });
});
