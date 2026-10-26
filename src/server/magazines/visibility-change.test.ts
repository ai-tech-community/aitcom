import { describe, expect, it } from "vitest";

import { planVisibilityChange, type VisibilityRecord } from "./visibility-change";

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
  it("public in an unlisted community without confirmation is refused", () => {
    expect(
      planVisibilityChange({
        next: "public",
        current: membersRecord,
        community: unlisted,
        confirmUnlistedPublic: false,
        actorId: ACTOR,
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
          now: NOW,
        }),
      ).toEqual({
        ok: true,
        record: { visibility: "public", publicConfirmedBy: null, publicConfirmedAt: null },
      });
    }
  });
});
