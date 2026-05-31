import { describe, expect, it } from "vitest";
import {
  summarizeCommunitySection,
  buildHubDigest,
  type CommunitySection,
} from "./digest";

const section = (
  communityId: string,
  over: Partial<CommunitySection> = {},
): CommunitySection =>
  summarizeCommunitySection({
    communityId,
    communityName: `Community ${communityId}`,
    newThreads: 0,
    newEvents: 0,
    newMembers: 0,
    ritualItems: [],
    ...over,
  });

describe("summarizeCommunitySection", () => {
  it("marks a section with no activity as empty", () => {
    expect(section("c1").isEmpty).toBe(true);
  });
  it("marks a section with any activity as non-empty", () => {
    expect(section("c1", { newThreads: 2 }).isEmpty).toBe(false);
    expect(section("c1", { ritualItems: ["Intro thread"] }).isEmpty).toBe(
      false,
    );
  });
});

describe("buildHubDigest", () => {
  it("drops empty sections", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [section("c1", { newThreads: 1 }), section("c2")],
      optedOutCommunityIds: new Set(),
    });
    expect(digest?.sections.map((s) => s.communityId)).toEqual(["c1"]);
  });

  it("drops opted-out sections", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [
        section("c1", { newThreads: 1 }),
        section("c2", { newThreads: 1 }),
      ],
      optedOutCommunityIds: new Set(["c2"]),
    });
    expect(digest?.sections.map((s) => s.communityId)).toEqual(["c1"]);
  });

  it("returns null when nothing survives (no email)", () => {
    expect(
      buildHubDigest({
        userId: "u1",
        sections: [section("c1"), section("c2")],
        optedOutCommunityIds: new Set(),
      }),
    ).toBeNull();
  });
});
