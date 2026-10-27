import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";

import {
  editorScopeOf,
  leadsCommunity,
  loadMagazineEditorship,
  NO_STANDING,
  requireCapability,
  requireEditorStanding,
  standingCan,
  standingOf,
} from "./editorship";

/** A database with one membership and no appointed staff role. */
function dbWith(
  membership: { role: CommunityRole; status: string } | undefined,
): typeof db {
  return {
    query: {
      communityMemberships: { findFirst: async () => membership },
      magazineStaff: { findFirst: async () => undefined },
    },
  } as unknown as typeof db;
}

const REF = { communityId: "c-1", magazineId: 7 };

describe("standingOf", () => {
  it("owner and admin are editor-in-chief whatever their staff row", () => {
    for (const communityRole of ["owner", "admin"] as const) {
      for (const staffRole of [null, "editor", "contributor"] as const) {
        expect(standingOf(communityRole, staffRole)).toEqual({
          role: "editor_in_chief",
          isEditor: true,
          isMember: true,
          leadsCommunity: true,
        });
      }
      expect(leadsCommunity(communityRole)).toBe(true);
    }
  });

  it("a staff role counts only for an active member", () => {
    expect(standingOf(null, "editor")).toEqual(NO_STANDING);
    expect(standingOf("member", "editor")).toEqual({
      role: "editor",
      isEditor: true,
      isMember: true,
      leadsCommunity: false,
    });
    expect(standingOf("member", "editor_in_chief")).toEqual({
      role: "editor_in_chief",
      isEditor: true,
      isMember: true,
      leadsCommunity: false,
    });
  });

  it("a contributor is a member but not an editor", () => {
    const standing = standingOf("member", "contributor");
    expect(standing).toEqual({
      role: "contributor",
      isEditor: false,
      isMember: true,
      leadsCommunity: false,
    });
    expect(standingCan(standing, "write")).toBe(true);
    expect(standingCan(standing, "edit")).toBe(false);
    expect(standingCan(standing, "manage")).toBe(false);
  });

  it("a moderator without a staff row is a reader", () => {
    expect(standingOf("moderator", null)).toEqual({
      role: null,
      isEditor: false,
      isMember: true,
      leadsCommunity: false,
    });
    expect(leadsCommunity("moderator")).toBe(false);
    expect(leadsCommunity("member")).toBe(false);
    expect(leadsCommunity(null)).toBe(false);
  });
});

describe("loadMagazineEditorship", () => {
  it.each<[CommunityRole, string, boolean, boolean]>([
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
    ).toEqual({
      role: isEditor ? "editor_in_chief" : null,
      isEditor,
      isMember,
      leadsCommunity: isEditor,
    });
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

  it("a community leader can start a magazine before it exists", async () => {
    expect(
      await loadMagazineEditorship(
        dbWith({ role: "owner", status: "active" }),
        { ...REF, magazineId: null },
        "user-1",
      ),
    ).toEqual(standingOf("owner", null));
  });
});

describe("editorScopeOf", () => {
  it("gives the same standing per community as the one-magazine loader", () => {
    expect(
      editorScopeOf(
        [
          { communityId: "a", role: "owner", status: "active" },
          { communityId: "b", role: "admin", status: "active" },
          { communityId: "c", role: "moderator", status: "active" },
          { communityId: "d", role: "member", status: "active" },
          { communityId: "e", role: "member", status: "pending_approval" },
          { communityId: "f", role: "admin", status: "banned" },
          { communityId: "g", role: "member", status: "invited" },
        ],
        [],
      ),
    ).toEqual({
      editorCommunityIds: ["a", "b"],
      memberCommunityIds: ["a", "b", "c", "d"],
    });
  });

  it("adds communities where a staff role gives edit, never for inactive members", () => {
    expect(
      editorScopeOf(
        [
          { communityId: "a", role: "owner", status: "active" },
          { communityId: "b", role: "member", status: "active" },
          { communityId: "c", role: "member", status: "active" },
          { communityId: "d", role: "member", status: "banned" },
          { communityId: "e", role: "moderator", status: "active" },
          { communityId: "f", role: "member", status: "invited" },
          { communityId: "g", role: "member", status: "pending_approval" },
        ],
        [
          { communityId: "a", role: "editor" },
          { communityId: "b", role: "editor" },
          { communityId: "c", role: "contributor" },
          { communityId: "d", role: "editor" },
          { communityId: "e", role: "editor_in_chief" },
          { communityId: "f", role: "editor" },
          { communityId: "g", role: "editor" },
          { communityId: "no-membership", role: "editor" },
        ],
      ),
    ).toEqual({
      editorCommunityIds: ["a", "b", "e"],
      memberCommunityIds: ["a", "b", "c", "e"],
    });
  });
});

describe("requireCapability", () => {
  it("requireCapability refuses a standing without it with FORBIDDEN", () => {
    expect(() =>
      requireCapability(standingOf("member", "contributor"), "write"),
    ).not.toThrow();
    for (const [standing, capability] of [
      [NO_STANDING, "write"],
      [standingOf("member", null), "write"],
      [standingOf("member", "contributor"), "edit"],
      [standingOf("member", "editor"), "manage"],
    ] as const) {
      let caught: unknown;
      try {
        requireCapability(standing, capability);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(TRPCError);
      expect((caught as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("keeps the editor wrapper until its callers move to capabilities", () => {
    expect(() =>
      requireEditorStanding(standingOf("member", "editor")),
    ).not.toThrow();
    expect(() =>
      requireEditorStanding(standingOf("member", "contributor")),
    ).toThrow(TRPCError);
  });
});
