import { describe, expect, it } from "vitest";

import {
  DUPLICATE_SOREN_RAVN_USER_ID,
  REAL_SOREN_RAVN_USER_ID,
  hasAgentOnPublicRoster,
  isHiddenFromPublicRoster,
} from "./public-roster";

function member(
  overrides: Partial<Parameters<typeof isHiddenFromPublicRoster>[0]> = {},
) {
  return {
    userId: "real-human-1",
    displayName: "Uretzky Greg (Zvi)",
    ...overrides,
  };
}

describe("isHiddenFromPublicRoster", () => {
  it("keeps named humans, Wren, and mattcarr71 visible", () => {
    expect(isHiddenFromPublicRoster(member())).toBe(false);
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "wren-1", displayName: "Wren" }),
      ),
    ).toBe(false);
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "matt-1", displayName: "mattcarr71" }),
      ),
    ).toBe(false);
    expect(
      isHiddenFromPublicRoster(
        member({
          userId: REAL_SOREN_RAVN_USER_ID,
          displayName: "Soren Ravn",
        }),
      ),
    ).toBe(false);
  });

  it("hides the three junk handles without deleting them", () => {
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "other-1", displayName: "Dev User" }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "other-2", displayName: "Review Bot 3002" }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "other-3", displayName: "445983370-cmd" }),
      ),
    ).toBe(true);
  });

  it("hides only the duplicate LVL 1 Soren Ravn id", () => {
    expect(
      isHiddenFromPublicRoster(
        member({
          userId: DUPLICATE_SOREN_RAVN_USER_ID,
          displayName: "Soren Ravn",
        }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({
          userId: REAL_SOREN_RAVN_USER_ID,
          displayName: "Soren Ravn",
        }),
      ),
    ).toBe(false);
  });

  it("hides QA Human / QA Fuse via the test flag and names", () => {
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "qa-1", displayName: "QA Human" }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({ userId: "qa-2", displayName: "QA Fuse" }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({
          userId: "qa-3",
          displayName: "Keerthi",
          hiddenFromPublic: true,
        }),
      ),
    ).toBe(true);
  });

  it("hides seed / example-test emails but not Wren or vanclaw plus-aliases", () => {
    expect(
      isHiddenFromPublicRoster(
        member({
          displayName: "Local Seed",
          email: "dev@aitcommunity.local",
        }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({
          displayName: "Example Bot",
          email: "review.bot.3002.fix@example.com",
        }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({
          displayName: "QA Plus",
          email: "greg+qa-human@klevox.com",
        }),
      ),
    ).toBe(true);
    expect(
      isHiddenFromPublicRoster(
        member({
          userId: "wren-1",
          displayName: "Wren",
          email: "greg+wren@klevox.com",
        }),
      ),
    ).toBe(false);
    expect(
      isHiddenFromPublicRoster(
        member({
          userId: REAL_SOREN_RAVN_USER_ID,
          displayName: "Soren Ravn",
          email: "greg+vanclaw@klevox.com",
        }),
      ),
    ).toBe(false);
  });
});

describe("hasAgentOnPublicRoster", () => {
  it("does not label the real Soren Ravn as an agent even if he owns one", () => {
    expect(
      hasAgentOnPublicRoster({
        userId: REAL_SOREN_RAVN_USER_ID,
        ownedActiveAgentId: "agent-soren",
      }),
    ).toBe(false);
  });

  it("does not reclassify Wren as human — owned agent still counts", () => {
    expect(
      hasAgentOnPublicRoster({
        userId: "wren-1",
        ownedActiveAgentId: "agent-wren",
      }),
    ).toBe(true);
    expect(
      hasAgentOnPublicRoster({
        userId: "wren-1",
        ownedActiveAgentId: null,
      }),
    ).toBe(false);
  });

  it("keeps the owner-bot mark for other humans who own an active agent", () => {
    expect(
      hasAgentOnPublicRoster({
        userId: "greg-1",
        ownedActiveAgentId: "test-bot-1",
      }),
    ).toBe(true);
    expect(
      hasAgentOnPublicRoster({
        userId: "matt-1",
        ownedActiveAgentId: null,
      }),
    ).toBe(false);
  });
});
