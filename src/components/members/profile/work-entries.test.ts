// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ProfileWork } from "@/server/members/profile-work";

import { recentWork, toWorkEntries } from "./work-entries";

const empty = { items: [], hasMore: false };

const work: ProfileWork = {
  articles: {
    items: [
      { id: 1, title: "A", slug: "a", publishedAt: "2026-03-01T00:00:00Z" },
    ],
    hasMore: false,
  },
  projects: {
    items: [
      {
        id: 2,
        title: "P",
        slug: "p",
        stage: "mvp",
        createdAt: "2026-05-01T00:00:00Z",
      },
    ],
    hasMore: false,
  },
  courses: {
    items: [
      {
        id: 3,
        title: "C",
        slug: "c",
        communitySlug: "club",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
    hasMore: false,
  },
  certificates: {
    items: [
      {
        kind: "hackathon",
        id: "h1",
        title: null,
        challengeSlug: null,
        outcome: "winner",
        issuedAt: "2026-04-01T00:00:00Z",
      },
      {
        kind: "course",
        id: "k1",
        title: "C",
        courseSlug: "c",
        communitySlug: "club",
        issuedAt: "2026-02-01T00:00:00Z",
      },
    ],
    hasMore: false,
  },
  events: {
    items: [{ id: 4, title: "E", slug: "e", date: "2026-06-01T00:00:00Z" }],
    hasMore: false,
  },
};

describe("toWorkEntries", () => {
  it("links each item to its own page", () => {
    const entries = toWorkEntries(work);
    expect(entries.articles[0]?.href).toBe("/blog/a");
    expect(entries.projects[0]?.href).toBe("/launchpad/p");
    expect(entries.courses[0]?.href).toBe("/communities/club/classroom/c");
    expect(entries.events[0]?.href).toBe("/events/e");
    expect(entries.certificates.map((c) => c.href)).toEqual([
      null,
      "/communities/club/classroom/c",
    ]);
    expect(entries.certificates.map((c) => c.detail)).toEqual([
      { type: "certificate", outcome: "winner" },
      { type: "certificate", outcome: "course" },
    ]);
  });
});

describe("recentWork", () => {
  it("takes the newest items across every list", () => {
    expect(recentWork(work, 3).map((e) => e.key)).toEqual([
      "event-4",
      "project-2",
      "certificate-h1",
    ]);
  });

  it("puts undated items last", () => {
    const undated: ProfileWork = {
      ...work,
      articles: {
        items: [{ id: 9, title: "U", slug: "u", publishedAt: null }],
        hasMore: false,
      },
      projects: empty,
      courses: empty,
      certificates: empty,
    };
    expect(recentWork(undated, 5).map((e) => e.key)).toEqual([
      "event-4",
      "article-9",
    ]);
  });
});
