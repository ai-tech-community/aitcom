import { describe, expect, it } from "vitest";

import { toProfileAwards } from "./profile-awards";

const row = (id: string, challengeId: number) => ({
  id,
  challengeId,
  label: `Winner ${id}`,
  earnedAt: new Date("2026-04-01T00:00:00Z"),
});

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
const rows = [row("a", 1), row("b", 2), row("c", 3), row("d", 99)];
const hidden = new Set(["c-hidden"]);
const at = "2026-04-01T00:00:00.000Z";

describe("toProfileAwards", () => {
  it("shows a visitor linked and draft awards, and hides hidden-community and missing challenges", () => {
    expect(
      toProfileAwards(rows, challenges, {
        hiddenCommunityIds: hidden,
        isOwner: false,
      }),
    ).toEqual([
      {
        id: "a",
        label: "Winner a",
        earnedAt: at,
        challenge: { title: "Open", slug: "open" },
      },
      { id: "b", label: "Winner b", earnedAt: at, challenge: null },
    ]);
  });

  it("still shows the owner an award whose challenge is gone, without a link", () => {
    expect(
      toProfileAwards(rows, challenges, {
        hiddenCommunityIds: hidden,
        isOwner: true,
      }).map((award) => [award.id, award.challenge]),
    ).toEqual([
      ["a", { title: "Open", slug: "open" }],
      ["b", null],
      ["d", null],
    ]);
  });
});
