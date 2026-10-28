import { describe, expect, it } from "vitest";

import type { IssueVisibility } from "./values";

import {
  effectiveVisibility,
  opensToOutsiders,
  planVisibilityChange,
  type VisibilityRecord,
} from "./visibility";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const ACTOR = "editor-1";
const listed = { slug: "garden-club", isListedInDirectory: true };
const unlisted = { slug: "garden-club", isListedInDirectory: false };
const membersRecord: VisibilityRecord = {
  visibility: "members",
  publicConfirmedBy: null,
  publicConfirmedAt: null,
};

describe("planVisibilityChange", () => {
  it("narrowing keeps the confirmation and saves the new visibility", () => {
    for (const visibility of ["public", "teaser"] as const) {
      const current: VisibilityRecord = {
        visibility,
        publicConfirmedBy: "editor-0",
        publicConfirmedAt: "2026-10-01T09:00:00.000Z",
      };
      expect(
        planVisibilityChange({
          next: "teaser",
          current,
          community: unlisted,
          confirmUnlistedPublic: false,
          actorId: ACTOR,
          actorLeadsCommunity: false,
          now: NOW,
        }),
      ).toEqual({ ok: true, record: { ...current, visibility: "teaser" } });
      expect(
        planVisibilityChange({
          next: "members",
          current,
          community: unlisted,
          confirmUnlistedPublic: false,
          actorId: ACTOR,
          actorLeadsCommunity: true,
          now: NOW,
        }),
      ).toEqual({ ok: true, record: membersRecord });
    }
  });

  it("widening preview to everyone needs a leader again", () => {
    const input = {
      next: "public" as const,
      current: {
        visibility: "teaser" as const,
        publicConfirmedBy: "editor-0",
        publicConfirmedAt: "2026-10-01T09:00:00.000Z",
      },
      community: unlisted,
      confirmUnlistedPublic: false,
      actorId: ACTOR,
      actorLeadsCommunity: true,
      now: NOW,
    };
    expect(planVisibilityChange(input)).toEqual({
      ok: false,
      code: "CONFIRM_UNLISTED_PUBLIC",
    });
    expect(
      planVisibilityChange({
        ...input,
        confirmUnlistedPublic: true,
        actorLeadsCommunity: false,
      }),
    ).toEqual({ ok: false, code: "UNLISTED_PUBLIC_LEADERS_ONLY" });
    expect(
      planVisibilityChange({ ...input, confirmUnlistedPublic: true }),
    ).toEqual({
      ok: true,
      record: {
        visibility: "public",
        publicConfirmedBy: ACTOR,
        publicConfirmedAt: NOW.toISOString(),
      },
    });
  });

  it("preview in a private community needs confirmation", () => {
    const input = {
      next: "teaser" as const,
      current: membersRecord,
      community: unlisted,
      confirmUnlistedPublic: false,
      actorId: ACTOR,
      actorLeadsCommunity: true,
      now: NOW,
    };
    expect(planVisibilityChange(input)).toEqual({
      ok: false,
      code: "CONFIRM_UNLISTED_PUBLIC",
    });
    expect(
      planVisibilityChange({ ...input, confirmUnlistedPublic: true }),
    ).toEqual({
      ok: true,
      record: {
        visibility: "teaser",
        publicConfirmedBy: ACTOR,
        publicConfirmedAt: NOW.toISOString(),
      },
    });
  });

  it("preview in a content-public community stores no confirmation", () => {
    for (const community of [
      listed,
      { slug: "ait", isListedInDirectory: false },
    ]) {
      expect(
        planVisibilityChange({
          next: "teaser",
          current: membersRecord,
          community,
          confirmUnlistedPublic: false,
          actorId: ACTOR,
          actorLeadsCommunity: true,
          now: NOW,
        }),
      ).toEqual({
        ok: true,
        record: { ...membersRecord, visibility: "teaser" },
      });
    }
  });

  it("public in an unlisted community without confirmation is refused", () => {
    expect(
      planVisibilityChange({
        next: "public",
        current: membersRecord,
        community: unlisted,
        confirmUnlistedPublic: false,
        actorId: ACTOR,
        actorLeadsCommunity: true,
        now: NOW,
      }),
    ).toEqual({ ok: false, code: "CONFIRM_UNLISTED_PUBLIC" });
  });

  it("records who and when on confirmed public", () => {
    const result = planVisibilityChange({
      next: "public",
      current: membersRecord,
      community: unlisted,
      confirmUnlistedPublic: true,
      actorId: ACTOR,
      actorLeadsCommunity: true,
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      record: {
        visibility: "public",
        publicConfirmedBy: ACTOR,
        publicConfirmedAt: NOW.toISOString(),
      },
    });
  });

  it("keeps an existing confirmation when re-saving public", () => {
    const current: VisibilityRecord = {
      visibility: "public",
      publicConfirmedBy: "editor-0",
      publicConfirmedAt: "2026-10-01T09:00:00.000Z",
    };
    const result = planVisibilityChange({
      next: "public",
      current,
      community: unlisted,
      confirmUnlistedPublic: false,
      actorId: ACTOR,
      actorLeadsCommunity: true,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, record: current });
  });

  it("members clears the confirmation", () => {
    const result = planVisibilityChange({
      next: "members",
      current: {
        visibility: "public",
        publicConfirmedBy: "editor-0",
        publicConfirmedAt: "2026-10-01T09:00:00.000Z",
      },
      community: unlisted,
      confirmUnlistedPublic: true,
      actorId: ACTOR,
      actorLeadsCommunity: true,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, record: membersRecord });
  });

  it("public in a listed community needs no confirmation and records none", () => {
    for (const confirmUnlistedPublic of [false, true]) {
      expect(
        planVisibilityChange({
          next: "public",
          current: membersRecord,
          community: listed,
          confirmUnlistedPublic,
          actorId: ACTOR,
          actorLeadsCommunity: true,
          now: NOW,
        }),
      ).toEqual({
        ok: true,
        record: {
          visibility: "public",
          publicConfirmedBy: null,
          publicConfirmedAt: null,
        },
      });
    }
  });

  it("only a community leader may pass a public confirmation", () => {
    for (const community of [unlisted, listed]) {
      for (const next of ["public", "teaser", "members"] as const) {
        expect(
          planVisibilityChange({
            next,
            current: membersRecord,
            community,
            confirmUnlistedPublic: true,
            actorId: ACTOR,
            actorLeadsCommunity: false,
            now: NOW,
          }),
        ).toEqual({ ok: false, code: "UNLISTED_PUBLIC_LEADERS_ONLY" });
      }
    }
  });

  it("a non-leader may save without confirming public", () => {
    expect(
      planVisibilityChange({
        next: "public",
        current: membersRecord,
        community: listed,
        confirmUnlistedPublic: false,
        actorId: ACTOR,
        actorLeadsCommunity: false,
        now: NOW,
      }),
    ).toEqual({ ok: true, record: { ...membersRecord, visibility: "public" } });
  });
});

describe("effectiveVisibility", () => {
  const issue = (visibility: IssueVisibility, confirmedAt: string | null) => ({
    status: "published" as const,
    visibility,
    publicConfirmedAt: confirmedAt,
  });
  const listed = { slug: "garden-club", isListedInDirectory: true };
  const unlisted = { slug: "garden-club", isListedInDirectory: false };

  it("is the stored value in a content-public community", () => {
    expect(effectiveVisibility(issue("teaser", null), listed)).toBe("teaser");
    expect(
      effectiveVisibility(issue("teaser", null), {
        slug: "ait",
        isListedInDirectory: false,
      }),
    ).toBe("teaser");
    expect(effectiveVisibility(issue("public", null), listed)).toBe("public");
    expect(effectiveVisibility(issue("members", null), listed)).toBe("members");
  });

  it("preview counts as members in an unlisted community until confirmed", () => {
    expect(effectiveVisibility(issue("teaser", null), unlisted)).toBe(
      "members",
    );
    expect(
      effectiveVisibility(
        issue("teaser", "2026-10-20T09:00:00.000Z"),
        unlisted,
      ),
    ).toBe("teaser");
  });

  it("counts an unconfirmed public issue as members in a content-private community", () => {
    expect(effectiveVisibility(issue("public", null), unlisted)).toBe(
      "members",
    );
    expect(
      effectiveVisibility(
        issue("public", "2026-10-20T09:00:00.000Z"),
        unlisted,
      ),
    ).toBe("public");
    expect(
      effectiveVisibility(
        issue("members", "2026-10-20T09:00:00.000Z"),
        unlisted,
      ),
    ).toBe("members");
  });
});

describe("opensToOutsiders", () => {
  it.each([
    ["members", false],
    ["teaser", true],
    ["public", true],
  ] as const)("%s → %s", (visibility, opens) => {
    expect(opensToOutsiders(visibility)).toBe(opens);
  });
});
