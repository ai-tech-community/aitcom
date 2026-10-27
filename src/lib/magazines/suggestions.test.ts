import { describe, expect, it } from "vitest";

import { parseSuggestionReason, type SuggestionReason } from "./suggestions";

describe("suggestion reasons", () => {
  it("reads every reason we write", () => {
    const reasons: SuggestionReason[] = [
      { type: "waitingSince", at: "2026-10-01T08:00:00Z" },
      { type: "topic", topic: "AI" },
      { type: "eventComingUp", at: "2026-11-01T00:00:00Z" },
      { type: "eventRecap", at: "2026-10-25T00:00:00Z", going: 12 },
      { type: "mostReplies", count: 8 },
      { type: "mostUpvotes", count: 4 },
      { type: "newMembers", count: 3 },
    ];
    for (const reason of reasons) {
      expect(parseSuggestionReason(reason)).toEqual(reason);
    }
  });

  it("drops reasons it does not know", () => {
    for (const reason of [{ type: "ai" }, { type: "topic" }, null, "x"]) {
      expect(parseSuggestionReason(reason)).toBeNull();
    }
  });
});
