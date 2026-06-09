import { describe, expect, it } from "vitest";
import {
  topicSlugify,
  MAX_TOPICS_PER_COMMUNITY,
  isAtTopicCap,
} from "./topic-helpers";

describe("topicSlugify", () => {
  it("lowercases and hyphenates", () => {
    expect(topicSlugify("YouTube Resources")).toBe("youtube-resources");
  });
  it("strips emoji and punctuation", () => {
    expect(topicSlugify("Wins ⭐!")).toBe("wins");
  });
  it("collapses repeated separators and trims", () => {
    expect(topicSlugify("  Hire Me / Looking  ")).toBe("hire-me-looking");
  });
});

describe("isAtTopicCap", () => {
  it("is false below the cap", () => {
    expect(isAtTopicCap(MAX_TOPICS_PER_COMMUNITY - 1)).toBe(false);
  });
  it("is true at the cap", () => {
    expect(isAtTopicCap(MAX_TOPICS_PER_COMMUNITY)).toBe(true);
  });
});
