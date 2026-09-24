import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "./hub";
import {
  canReadContent,
  canReadRoster,
  communityContentReadableWhere,
  isContentPublic,
  isRosterPublic,
} from "./content-visibility";

const HUB = { slug: HUB_SLUG, isListedInDirectory: false };
const LISTED = { slug: "ait-community-netherlands", isListedInDirectory: true };
const UNLISTED = { slug: "secret-guild", isListedInDirectory: false };

describe("content visibility", () => {
  it("is public on the Hub and on listed communities", () => {
    expect(isContentPublic(HUB)).toBe(true);
    expect(isContentPublic(LISTED)).toBe(true);
  });

  it("is members-only on an unlisted community", () => {
    expect(isContentPublic(UNLISTED)).toBe(false);
    expect(canReadContent(UNLISTED, false)).toBe(false);
    expect(canReadContent(UNLISTED, true)).toBe(true);
  });

  it("lets anyone read public content", () => {
    expect(canReadContent(HUB, false)).toBe(true);
    expect(canReadContent(LISTED, false)).toBe(true);
  });
});

describe("roster visibility", () => {
  it("is public only on a listed community", () => {
    expect(isRosterPublic(LISTED)).toBe(true);
    expect(isRosterPublic(UNLISTED)).toBe(false);
  });

  it("keeps the Hub roster members-only", () => {
    expect(isRosterPublic(HUB)).toBe(false);
    expect(canReadRoster(HUB, false)).toBe(false);
    expect(canReadRoster(HUB, true)).toBe(true);
  });

  it("lets members read an unlisted roster", () => {
    expect(canReadRoster(UNLISTED, false)).toBe(false);
    expect(canReadRoster(UNLISTED, true)).toBe(true);
  });
});

describe("communityContentReadableWhere", () => {
  it("adds no condition when nothing is hidden", () => {
    expect(communityContentReadableWhere([])).toBeNull();
  });

  it("hides listed ids but keeps unscoped Hub threads", () => {
    expect(communityContentReadableWhere(["a", "b"])).toEqual({
      or: [
        { communityId: { exists: false } },
        { communityId: { not_in: ["a", "b"] } },
      ],
    });
  });
});
