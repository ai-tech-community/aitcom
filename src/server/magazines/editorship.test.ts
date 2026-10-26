import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";

import {
  editorScopeOf,
  loadMagazineEditorship,
  NO_STANDING,
  requireEditorStanding,
} from "./editorship";

/** A database whose one membership row is `membership` (or none). */
function dbWith(
  membership: { role: CommunityRole; status: string } | undefined,
): typeof db {
  return {
    query: {
      communityMemberships: { findFirst: async () => membership },
    },
  } as unknown as typeof db;
}

const REF = { communityId: "c-1", magazineId: 7 };

describe("loadMagazineEditorship (slice 1: the community membership)", () => {
  it.each<[CommunityRole, string, boolean, boolean]>([
    // [role, status, isEditor, isMember]
    ["owner", "active", true, true],
    ["admin", "active", true, true],
    ["moderator", "active", false, true],
    ["member", "active", false, true],
    ["admin", "banned", false, false],
    ["member", "pending_approval", false, false],
    ["member", "invited", false, false],
  ])("%s (%s)", async (role, status, isEditor, isMember) => {
    expect(
      await loadMagazineEditorship(dbWith({ role, status }), REF, "user-1"),
    ).toEqual({ isEditor, isMember });
  });

  it("no membership and anonymous viewers have no standing", async () => {
    expect(
      await loadMagazineEditorship(dbWith(undefined), REF, "user-1"),
    ).toEqual(NO_STANDING);
    expect(
      await loadMagazineEditorship(
        dbWith({ role: "owner", status: "active" }),
        REF,
        null,
      ),
    ).toEqual(NO_STANDING);
  });
});

describe("editorScopeOf", () => {
  it("gives the same standing per community as the one-magazine loader", () => {
    expect(
      editorScopeOf([
        { communityId: "a", role: "owner", status: "active" },
        { communityId: "b", role: "admin", status: "active" },
        { communityId: "c", role: "moderator", status: "active" },
        { communityId: "d", role: "member", status: "active" },
        { communityId: "e", role: "member", status: "pending_approval" },
        { communityId: "f", role: "admin", status: "banned" },
        { communityId: "g", role: "member", status: "invited" },
      ]),
    ).toEqual({
      editorCommunityIds: ["a", "b"],
      memberCommunityIds: ["a", "b", "c", "d"],
    });
  });
});

describe("requireEditorStanding", () => {
  it("refuses non-editors with FORBIDDEN", () => {
    expect(() =>
      requireEditorStanding({ isEditor: true, isMember: true }),
    ).not.toThrow();
    for (const standing of [NO_STANDING, { isEditor: false, isMember: true }]) {
      let caught: unknown;
      try {
        requireEditorStanding(standing);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(TRPCError);
      expect((caught as TRPCError).code).toBe("FORBIDDEN");
    }
  });
});
