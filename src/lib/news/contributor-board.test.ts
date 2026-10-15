import { describe, expect, it } from "vitest";

import {
  contributorBoardEntry,
  type ContributorBoardSource,
} from "./contributor-board";

const source = (
  overrides: Partial<ContributorBoardSource> = {},
): ContributorBoardSource => ({
  userId: "ada",
  displayName: "Ada Lovelace",
  isPublic: true,
  hiddenFromPublic: false,
  image: " https://cdn.example/ada.jpg ",
  points: 60,
  agentName: " Scout ",
  agentVisibility: "visible",
  ...overrides,
});

describe("contributorBoardEntry", () => {
  it("keeps a public member's stored name, photo, and visible agent", () => {
    expect(contributorBoardEntry(source())).toEqual({
      userId: "ada",
      name: "Ada Lovelace",
      profilePath: "/members/ada",
      image: "https://cdn.example/ada.jpg",
      agentName: "Scout",
      points: 60,
    });
  });

  it("drops private, hidden, and nameless profiles", () => {
    expect(contributorBoardEntry(source({ isPublic: false }))).toBeNull();
    expect(
      contributorBoardEntry(source({ hiddenFromPublic: true })),
    ).toBeNull();
    expect(contributorBoardEntry(source({ displayName: "  " }))).toBeNull();
    expect(contributorBoardEntry(source({ displayName: null }))).toBeNull();
    expect(contributorBoardEntry(source({ points: Number.NaN }))).toBeNull();
  });

  it("uses no photo and no agent name unless both are stored and visible", () => {
    expect(
      contributorBoardEntry(
        source({
          image: "  ",
          agentName: "Ghost writer",
          agentVisibility: "ghost",
        }),
      ),
    ).toMatchObject({ image: null, agentName: null });
    expect(
      contributorBoardEntry(
        source({ agentName: "   ", agentVisibility: "visible" }),
      ),
    ).toMatchObject({ agentName: null });
    expect(
      contributorBoardEntry(
        source({ agentName: "Scout", agentVisibility: null }),
      ),
    ).toMatchObject({ agentName: null });
  });
});
