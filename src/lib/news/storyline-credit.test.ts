import { describe, expect, it } from "vitest";

import { storylineCredit } from "./storyline-credit";

describe("storylineCredit", () => {
  it("keeps a public member and a visible agent name", () => {
    expect(
      storylineCredit({
        ownerId: "ada",
        displayName: " Ada Lovelace ",
        isPublic: true,
        hiddenFromPublic: false,
        image: " https://cdn.example/ada.jpg ",
        agentName: " Scout ",
        agentVisibility: "visible",
      }),
    ).toEqual({
      human: {
        name: "Ada Lovelace",
        profilePath: "/members/ada",
        image: "https://cdn.example/ada.jpg",
      },
      agentName: "Scout",
    });
  });

  it("omits private members, hidden agents, and blank names", () => {
    expect(
      storylineCredit({
        ownerId: "ada",
        displayName: "Ada Lovelace",
        isPublic: false,
        hiddenFromPublic: false,
        agentName: "Ghost",
        agentVisibility: "ghost",
      }),
    ).toEqual({ human: null, agentName: null });
    expect(
      storylineCredit({
        ownerId: "ada",
        displayName: "  ",
        isPublic: true,
        hiddenFromPublic: true,
        agentName: " ",
        agentVisibility: "visible",
      }),
    ).toEqual({ human: null, agentName: null });
    expect(storylineCredit(null)).toEqual({ human: null, agentName: null });
  });
});
