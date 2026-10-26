import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { CommunityRole } from "@/server/communities/role-utils";
import type { IssueStatus, IssueVisibility } from "@/lib/magazines/values";

import {
  effectiveVisibility,
  type IssueAccessInput,
  isMagazineEditorRole,
  requireMagazineEditor,
  resolveMagazineIssueAccess,
} from "./issue-access";

const CONFIRMED = "2026-10-26T10:00:00.000Z";

function input(over: {
  role?: CommunityRole | null;
  listed?: boolean;
  slug?: string;
  deleted?: boolean;
  community?: null;
  status?: IssueStatus;
  visibility?: IssueVisibility;
  confirmedAt?: string | null;
}): IssueAccessInput {
  const role = over.role ?? null;
  return {
    viewer: { userId: role === null ? null : "user-1", role },
    community:
      over.community === null
        ? null
        : {
            slug: over.slug ?? "garden-club",
            isListedInDirectory: over.listed ?? true,
            deleted: over.deleted ?? false,
          },
    issue: {
      status: over.status ?? "published",
      visibility: over.visibility ?? "public",
      publicConfirmedAt: over.confirmedAt ?? null,
    },
  };
}

describe("resolveMagazineIssueAccess", () => {
  it.each<
    [
      string,
      CommunityRole | null,
      boolean,
      IssueStatus,
      IssueVisibility,
      string | null,
      string,
    ]
  >([
    // [label, role, listed, status, visibility, confirmedAt, expected]
    ["editor sees a draft", "owner", true, "draft", "members", null, "editor"],
    ["admin is editor", "admin", false, "published", "members", null, "editor"],
    ["moderator is a reader", "moderator", true, "draft", "members", null, "none"],
    ["member reads a members issue", "member", false, "published", "members", null, "full"],
    ["outsider: members issue is hidden", null, true, "published", "members", null, "none"],
    ["outsider reads public in a listed community", null, true, "published", "public", null, "full"],
    ["outsider: unconfirmed public in an unlisted community is members-only", null, false, "published", "public", null, "none"],
    ["outsider reads confirmed public in an unlisted community", null, false, "published", "public", CONFIRMED, "full"],
    ["nobody but editors sees a draft", "member", true, "draft", "public", null, "none"],
  ])("resolver: %s", (_label, role, listed, status, visibility, confirmedAt, expected) => {
    expect(
      resolveMagazineIssueAccess(
        input({ role, listed, status, visibility, confirmedAt }),
      ),
    ).toBe(expected);
  });

  it("a deleted or missing community is none for everyone, editors included", () => {
    for (const role of ["owner", "admin", "member", null] as const) {
      expect(
        resolveMagazineIssueAccess(input({ role, deleted: true })),
      ).toBe("none");
      expect(
        resolveMagazineIssueAccess(input({ role, community: null })),
      ).toBe("none");
    }
  });

  it("the Hub counts as content-public (slug 'ait', unlisted)", () => {
    expect(
      resolveMagazineIssueAccess(
        input({ role: null, slug: "ait", listed: false, confirmedAt: null }),
      ),
    ).toBe("full");
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
    expect(effectiveVisibility(issue("public", null), listed)).toBe("public");
    expect(effectiveVisibility(issue("members", null), listed)).toBe("members");
  });

  it("counts an unconfirmed public issue as members in a content-private community", () => {
    expect(effectiveVisibility(issue("public", null), unlisted)).toBe("members");
    expect(effectiveVisibility(issue("public", CONFIRMED), unlisted)).toBe("public");
    expect(effectiveVisibility(issue("members", CONFIRMED), unlisted)).toBe("members");
  });
});

describe("editor role", () => {
  it("is an active owner or admin only", () => {
    expect(isMagazineEditorRole("owner")).toBe(true);
    expect(isMagazineEditorRole("admin")).toBe(true);
    expect(isMagazineEditorRole("moderator")).toBe(false);
    expect(isMagazineEditorRole("member")).toBe(false);
    expect(isMagazineEditorRole(null)).toBe(false);
  });

  it("requireMagazineEditor refuses non-editors with FORBIDDEN", () => {
    expect(() => requireMagazineEditor("owner")).not.toThrow();
    expect(() => requireMagazineEditor("admin")).not.toThrow();
    for (const role of ["moderator", "member", null] as const) {
      let caught: unknown;
      try {
        requireMagazineEditor(role);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(TRPCError);
      expect((caught as TRPCError).code).toBe("FORBIDDEN");
    }
  });
});
