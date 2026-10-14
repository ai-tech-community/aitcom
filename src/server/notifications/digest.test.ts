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

const highlight = {
  title: "A thread",
  path: "/communities/ait/forum/a-thread",
  kind: "thread" as const,
};

describe("summarizeCommunitySection", () => {
  it("marks a section with no highlights or rituals as empty", () => {
    expect(section("c1").isEmpty).toBe(true);
    expect(section("c1", { newThreads: 2 }).isEmpty).toBe(true);
  });
  it("marks highlights or rituals as non-empty", () => {
    expect(section("c1", { highlights: [highlight] }).isEmpty).toBe(false);
    expect(section("c1", { ritualItems: ["Intro thread"] }).isEmpty).toBe(
      false,
    );
  });
});

describe("buildHubDigest", () => {
  it("drops empty sections", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [section("c1", { highlights: [highlight] }), section("c2")],
      optedOutCommunityIds: new Set(),
    });
    expect(digest?.sections.map((s) => s.communityId)).toEqual(["c1"]);
  });

  it("drops opted-out communities", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [
        section("c1", { highlights: [highlight] }),
        section("c2", { highlights: [highlight] }),
      ],
      optedOutCommunityIds: new Set(["c2"]),
    });
    expect(digest?.sections.map((s) => s.communityId)).toEqual(["c1"]);
  });

  it("drops a section the member turned off and skips the email when nothing remains", () => {
    const withJobs = buildHubDigest({
      userId: "u1",
      sections: [section("c1", { highlights: [highlight] })],
      jobs: [
        {
          title: "Research Engineer",
          path: "/jobs/research-engineer",
          company: "Northwind",
        },
      ],
      optedOutCommunityIds: new Set(),
      optedOutSections: new Set(["community"]),
    });
    expect(withJobs?.sections).toEqual([]);
    expect(withJobs?.jobs).toHaveLength(1);

    const withNews = buildHubDigest({
      userId: "u1",
      sections: [],
      news: [
        {
          id: "n1",
          title: "Models",
          summary: "A short note.",
          articleUrl: "https://example.com/models",
          path: "/en/news#news-n1",
        },
      ],
      optedOutCommunityIds: new Set(),
      optedOutSections: new Set(["news"]),
    });
    expect(withNews).toBeNull();

    expect(
      buildHubDigest({
        userId: "u1",
        sections: [],
        events: [
          { title: "Meetup", path: "/events/meetup", when: "2026-10-13" },
        ],
        optedOutCommunityIds: new Set(),
        optedOutSections: new Set(["events"]),
      }),
    ).toBeNull();
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

describe("buildHubDigest discovery", () => {
  it("returns a digest with only a discovery pick when all sections are empty", () => {
    const d = buildHubDigest({
      userId: "u1",
      sections: [
        summarizeCommunitySection({
          communityId: "c1",
          communityName: "C1",
          newThreads: 0,
          newEvents: 0,
          newMembers: 0,
          ritualItems: [],
        }),
      ],
      optedOutCommunityIds: new Set(),
      discovery: { name: "Robotics", slug: "robotics" },
    });
    expect(d).not.toBeNull();
    expect(d!.sections).toHaveLength(0);
    expect(d!.discovery).toEqual({ name: "Robotics", slug: "robotics" });
  });

  it("keeps a digest when the only news is the weekly top three", () => {
    const digest = buildHubDigest({
      userId: "u1",
      sections: [],
      contributors: [
        { name: "Ada", path: "/members/ada", points: 60 },
        { name: "Grace", path: "/members/grace", points: 50 },
        { name: "Lin", path: "/members/lin", points: 10 },
        { name: "Extra", path: "/members/extra", points: 10 },
      ],
      optedOutCommunityIds: new Set(),
    });
    expect(digest?.contributors).toEqual([
      { name: "Ada", path: "/members/ada", points: 60 },
      { name: "Grace", path: "/members/grace", points: 50 },
      { name: "Lin", path: "/members/lin", points: 10 },
    ]);
  });

  it("returns null when sections empty and no discovery", () => {
    expect(
      buildHubDigest({
        userId: "u1",
        sections: [],
        optedOutCommunityIds: new Set(),
      }),
    ).toBeNull();
  });
});
