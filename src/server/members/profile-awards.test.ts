import { describe, expect, it } from "vitest";

import { toProfileAwards } from "./profile-awards";

const row = (id: string, challengeId: number) => ({
  id,
  challengeId,
  label: `Winner ${id}`,
  earnedAt: new Date("2026-04-01T00:00:00Z"),
});

describe("toProfileAwards", () => {
  const challenges = new Map([
    [
      1,
      {
        id: 1,
        title: "Open",
        slug: "open",
        status: "completed" as const,
        communityId: null,
      },
    ],
    [
      2,
      {
        id: 2,
        title: "Draft",
        slug: "draft",
        status: "draft" as const,
        communityId: null,
      },
    ],
    [
      3,
      {
        id: 3,
        title: "Secret",
        slug: "secret",
        status: "active" as const,
        communityId: "c-hidden",
      },
    ],
  ]);

  it("links a published challenge, keeps a draft or missing one without a link, and hides one the viewer cannot read", () => {
    expect(
      toProfileAwards(
        [row("a", 1), row("b", 2), row("c", 3), row("d", 99)],
        challenges,
        new Set(["c-hidden"]),
      ),
    ).toEqual([
      {
        id: "a",
        label: "Winner a",
        earnedAt: "2026-04-01T00:00:00.000Z",
        challenge: { title: "Open", slug: "open" },
      },
      {
        id: "b",
        label: "Winner b",
        earnedAt: "2026-04-01T00:00:00.000Z",
        challenge: null,
      },
      {
        id: "d",
        label: "Winner d",
        earnedAt: "2026-04-01T00:00:00.000Z",
        challenge: null,
      },
    ]);
  });
});
