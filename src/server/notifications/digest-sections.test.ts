import { describe, expect, it } from "vitest";

import {
  isDigestIndexableOpenJob,
  selectCommunityHighlights,
  selectDigestJobs,
  selectDigestNews,
  selectLaunchpadPicks,
  selectUpcomingEvents,
  type DigestJobCandidate,
} from "./digest-sections";

const NOW = new Date("2026-10-12T14:00:00.000Z");

function job(over: Partial<DigestJobCandidate> = {}): DigestJobCandidate {
  return {
    title: "Research Engineer",
    slug: "research-engineer",
    company: "Northwind",
    status: "open",
    descriptionText: "a".repeat(200),
    postedAt: new Date("2026-10-10T00:00:00.000Z"),
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...over,
  };
}

describe("isDigestIndexableOpenJob", () => {
  it("keeps an open role with a real title and a 200-character description", () => {
    expect(isDigestIndexableOpenJob(job())).toBe(true);
  });

  it("drops descriptions under 200 characters", () => {
    expect(
      isDigestIndexableOpenJob(job({ descriptionText: "a".repeat(199) })),
    ).toBe(false);
    expect(isDigestIndexableOpenJob(job({ descriptionText: null }))).toBe(
      false,
    );
  });

  it("drops junk titles even when the description is long", () => {
    expect(
      isDigestIndexableOpenJob(
        job({ title: "View Job", descriptionText: "a".repeat(400) }),
      ),
    ).toBe(false);
    expect(
      isDigestIndexableOpenJob(
        job({ title: "Details", descriptionText: "a".repeat(400) }),
      ),
    ).toBe(false);
  });

  it("drops closed roles", () => {
    expect(isDigestIndexableOpenJob(job({ status: "closed" }))).toBe(false);
  });
});

describe("selectCommunityHighlights", () => {
  const pool = [
    {
      communityId: "c1",
      title: "Quiet thread",
      path: "/communities/ait/forum/quiet",
      kind: "thread" as const,
      score: 1,
    },
    {
      communityId: "c2",
      title: "Busy thread",
      path: "/communities/lab/forum/busy",
      kind: "thread" as const,
      score: 9,
    },
    {
      communityId: "c1",
      title: "Liked post",
      path: "/communities/ait",
      kind: "post" as const,
      score: 4,
    },
    {
      communityId: "c1",
      title: "No engagement",
      path: "/communities/ait/forum/zero",
      kind: "thread" as const,
      score: 0,
    },
  ];

  it("ranks the member's threads and posts by replies or likes", () => {
    const picked = selectCommunityHighlights(pool, new Set(["c1"]));
    expect(picked.map((item) => item.title)).toEqual([
      "Liked post",
      "Quiet thread",
    ]);
  });

  it("ignores communities the member is not in", () => {
    const picked = selectCommunityHighlights(pool, new Set(["c2"]));
    expect(picked.map((item) => item.title)).toEqual(["Busy thread"]);
  });
});

describe("selectUpcomingEvents", () => {
  it("keeps published events that start in the next 14 days", () => {
    const picked = selectUpcomingEvents(
      [
        {
          title: "Yesterday",
          slug: "yesterday",
          date: "2026-10-11",
          status: "published",
        },
        {
          title: "Tomorrow",
          slug: "tomorrow",
          date: "2026-10-13",
          status: "published",
        },
        {
          title: "Draft",
          slug: "draft",
          date: "2026-10-14",
          status: "draft",
        },
        {
          title: "Too far",
          slug: "far",
          date: "2026-10-26",
          status: "published",
        },
      ],
      NOW,
    );
    expect(picked.map((event) => event.slug)).toEqual(["tomorrow"]);
  });

  it("keeps an event that starts inside the window and drops one that already started", () => {
    const picked = selectUpcomingEvents(
      [
        {
          title: "Summit",
          slug: "summit",
          date: "2026-10-12",
          endDate: "2026-10-14",
          status: "published",
        },
        {
          title: "Already going",
          slug: "going",
          date: "2026-10-01",
          endDate: "2026-10-20",
          status: "published",
        },
      ],
      NOW,
    );
    expect(picked.map((event) => event.slug)).toEqual(["summit"]);
  });
});

describe("selectDigestJobs", () => {
  it("returns the newest indexable jobs and skips thin ones", () => {
    const picked = selectDigestJobs([
      job({
        slug: "old",
        postedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
      job({
        slug: "thin",
        descriptionText: "too short",
        postedAt: new Date("2026-10-11T00:00:00.000Z"),
      }),
      job({
        slug: "new",
        postedAt: new Date("2026-10-11T00:00:00.000Z"),
      }),
    ]);
    expect(picked.map((row) => row.slug)).toEqual(["new", "old"]);
  });
});

describe("selectDigestNews", () => {
  const created = new Date("2026-10-01T00:00:00.000Z");

  it("keeps six stories from the last 7 days, newest first", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `n${index}`,
      publishedAt: new Date(
        `2026-10-${String(5 + index).padStart(2, "0")}T00:00:00.000Z`,
      ),
      createdAt: created,
    }));
    items.push({
      id: "old",
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: created,
    });
    const picked = selectDigestNews(items, NOW);
    expect(picked).toHaveLength(6);
    expect(picked.map((item) => item.id)).toEqual([
      "n7",
      "n6",
      "n5",
      "n4",
      "n3",
      "n2",
    ]);
    expect(picked.some((item) => item.id === "old")).toBe(false);
  });
});

describe("selectLaunchpadPicks", () => {
  it("keeps this week's published projects, highest votes first", () => {
    const picked = selectLaunchpadPicks(
      [
        {
          title: "Old",
          slug: "old",
          status: "published",
          voteCount: 50,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
        {
          title: "Quiet launch",
          slug: "quiet",
          status: "published",
          voteCount: 1,
          createdAt: "2026-10-10T00:00:00.000Z",
        },
        {
          title: "Loud launch",
          slug: "loud",
          status: "published",
          voteCount: 8,
          createdAt: "2026-10-11T00:00:00.000Z",
        },
        {
          title: "Draft",
          slug: "draft",
          status: "draft",
          voteCount: 9,
          createdAt: "2026-10-11T00:00:00.000Z",
        },
      ],
      NOW,
    );
    expect(picked.map((project) => project.slug)).toEqual(["loud", "quiet"]);
  });
});
