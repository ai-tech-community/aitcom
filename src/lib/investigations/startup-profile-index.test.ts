import { describe, expect, it } from "vitest";

import {
  isThinStartupProfile,
  startupProfileIndexInput,
  startupProfileRobots,
} from "./startup-profile-index";

const SHORT = "a".repeat(79);
const LONG = "a".repeat(80);

describe("isThinStartupProfile", () => {
  it("is thin when the description is under 80 characters and there are no open roles", () => {
    expect(isThinStartupProfile({ description: SHORT, openRoleCount: 0 })).toBe(
      true,
    );
    expect(isThinStartupProfile({ description: "", openRoleCount: 0 })).toBe(
      true,
    );
    expect(isThinStartupProfile({ description: null, openRoleCount: 0 })).toBe(
      true,
    );
    expect(
      isThinStartupProfile({ description: undefined, openRoleCount: 0 }),
    ).toBe(true);
    expect(isThinStartupProfile({ description: "   ", openRoleCount: 0 })).toBe(
      true,
    );
  });

  it("is not thin once the description reaches 80 characters", () => {
    expect(isThinStartupProfile({ description: LONG, openRoleCount: 0 })).toBe(
      false,
    );
  });

  it("is not thin when an open role exists, even with a short description", () => {
    expect(isThinStartupProfile({ description: SHORT, openRoleCount: 1 })).toBe(
      false,
    );
    expect(isThinStartupProfile({ description: null, openRoleCount: 2 })).toBe(
      false,
    );
  });

  it("becomes indexable when enrichment lengthens the description", () => {
    const before = { description: SHORT, openRoleCount: 0 };
    const after = { description: LONG, openRoleCount: 0 };
    expect(isThinStartupProfile(before)).toBe(true);
    expect(isThinStartupProfile(after)).toBe(false);
  });

  it("treats a non-positive role count as no open roles", () => {
    expect(
      isThinStartupProfile({ description: SHORT, openRoleCount: -1 }),
    ).toBe(true);
    expect(
      isThinStartupProfile({ description: SHORT, openRoleCount: Number.NaN }),
    ).toBe(true);
  });

  it("counts the trimmed public blurb, not surrounding whitespace", () => {
    expect(
      isThinStartupProfile({
        description: `  ${SHORT}  `,
        openRoleCount: 0,
      }),
    ).toBe(true);
    expect(
      isThinStartupProfile({
        description: `  ${LONG}  `,
        openRoleCount: 0,
      }),
    ).toBe(false);
  });
});

describe("startupProfileIndexInput", () => {
  it("feeds a sourced answer into the same 80-character rule when the row has no blurb", () => {
    const kueez = startupProfileIndexInput({
      slug: "kueez",
      description: null,
      openRoleCount: 0,
    });
    expect(kueez.description?.length).toBeGreaterThanOrEqual(80);
    expect(isThinStartupProfile(kueez)).toBe(false);
    expect(
      startupProfileRobots({
        slug: "kueez",
        description: null,
        openRoleCount: 0,
      }),
    ).toEqual({ index: true, follow: true });
  });

  it("still noindexes an empty profile that has no sourced answer", () => {
    expect(
      isThinStartupProfile(
        startupProfileIndexInput({
          slug: "blank-co",
          description: null,
          openRoleCount: 0,
        }),
      ),
    ).toBe(true);
    expect(
      startupProfileRobots({
        slug: "blank-co",
        description: "   ",
        openRoleCount: 0,
      }),
    ).toEqual({ index: false, follow: true });
  });

  it("keeps a real short blurb on the thin side of the same rule", () => {
    expect(
      isThinStartupProfile(
        startupProfileIndexInput({
          slug: "kueez",
          description: SHORT,
          openRoleCount: 0,
        }),
      ),
    ).toBe(true);
  });
});

describe("startupProfileRobots", () => {
  it("noindexes a thin profile and keeps follow", () => {
    expect(
      startupProfileRobots({ description: SHORT, openRoleCount: 0 }),
    ).toEqual({ index: false, follow: true });
  });

  it("indexes a profile with a real description", () => {
    expect(
      startupProfileRobots({ description: LONG, openRoleCount: 0 }),
    ).toEqual({ index: true, follow: true });
  });
});
