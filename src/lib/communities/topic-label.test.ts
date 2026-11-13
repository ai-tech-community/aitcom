import { describe, expect, it } from "vitest";

import { topicLabel, topicText } from "./topic-label";

const TOPICS = [
  { slug: "wins", label: "Wins", emoji: "⭐" },
  { slug: "general", label: "General", emoji: null },
];

describe("topicLabel", () => {
  it("puts the emoji before the label", () => {
    expect(topicLabel({ label: "Wins", emoji: "⭐" })).toBe("⭐ Wins");
  });

  it("is the label alone without an emoji", () => {
    expect(topicLabel({ label: "General", emoji: null })).toBe("General");
    expect(topicLabel({ label: "General" })).toBe("General");
  });
});

describe("topicText", () => {
  it("names a listed topic by its label", () => {
    expect(topicText("wins", TOPICS)).toBe("⭐ Wins");
  });

  it("falls back to the slug for a topic no longer listed", () => {
    expect(topicText("old-topic", TOPICS)).toBe("old-topic");
  });
});
