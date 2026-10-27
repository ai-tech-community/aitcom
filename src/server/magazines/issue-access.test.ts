import { describe, expect, it } from "vitest";

import type { IssueStatus, IssueVisibility } from "@/lib/magazines/values";

import { type MagazineStanding, NO_STANDING } from "./editorship";
import {
  type IssueAccessInput,
  resolveMagazineIssueAccess,
} from "./issue-access";

const CONFIRMED = "2026-10-26T10:00:00.000Z";

type Who = "editor" | "member" | "outsider";

const STANDING: Record<Who, MagazineStanding> = {
  editor: {
    role: "editor",
    isEditor: true,
    isMember: true,
    leadsCommunity: false,
  },
  member: {
    role: null,
    isEditor: false,
    isMember: true,
    leadsCommunity: false,
  },
  outsider: NO_STANDING,
};

function input(over: {
  who?: Who;
  listed?: boolean;
  slug?: string;
  deleted?: boolean;
  community?: null;
  status?: IssueStatus;
  visibility?: IssueVisibility;
  confirmedAt?: string | null;
}): IssueAccessInput {
  return {
    viewer: STANDING[over.who ?? "outsider"],
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
    [string, Who, boolean, IssueStatus, IssueVisibility, string | null, string]
  >([
    // [label, who, listed, status, visibility, confirmedAt, expected]
    ["editor sees a draft", "editor", true, "draft", "members", null, "editor"],
    [
      "editor of an unlisted community",
      "editor",
      false,
      "published",
      "members",
      null,
      "editor",
    ],
    [
      "member reads a members issue",
      "member",
      false,
      "published",
      "members",
      null,
      "full",
    ],
    [
      "outsider: members issue is hidden",
      "outsider",
      true,
      "published",
      "members",
      null,
      "none",
    ],
    [
      "outsider reads public in a listed community",
      "outsider",
      true,
      "published",
      "public",
      null,
      "full",
    ],
    [
      "outsider: unconfirmed public in an unlisted community is members-only",
      "outsider",
      false,
      "published",
      "public",
      null,
      "none",
    ],
    [
      "outsider reads confirmed public in an unlisted community",
      "outsider",
      false,
      "published",
      "public",
      CONFIRMED,
      "full",
    ],
    [
      "nobody but editors sees a draft",
      "member",
      true,
      "draft",
      "public",
      null,
      "none",
    ],
  ])(
    "resolver: %s",
    (_label, who, listed, status, visibility, confirmedAt, expected) => {
      expect(
        resolveMagazineIssueAccess(
          input({ who, listed, status, visibility, confirmedAt }),
        ),
      ).toBe(expected);
    },
  );

  it("a deleted or missing community is none for everyone, editors included", () => {
    for (const who of ["editor", "member", "outsider"] as const) {
      expect(resolveMagazineIssueAccess(input({ who, deleted: true }))).toBe(
        "none",
      );
      expect(resolveMagazineIssueAccess(input({ who, community: null }))).toBe(
        "none",
      );
    }
  });

  it("the Hub counts as content-public (slug 'ait', unlisted)", () => {
    expect(
      resolveMagazineIssueAccess(
        input({ slug: "ait", listed: false, confirmedAt: null }),
      ),
    ).toBe("full");
  });
});
