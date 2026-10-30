import { describe, expect, it, vi } from "vitest";

import type { Deps } from "./deps";
import { loadIssueFactsById } from "./issue-access";
import { issueOrigin, verifyMagazineJoinSource } from "./issue-origin";

function fixture(issue: unknown) {
  const findByID = vi.fn(async () => issue);
  const communityRead = vi.fn();
  const deps = {
    payload: { findByID },
    db: { query: { communities: { findFirst: communityRead } } },
  } as unknown as Deps;
  return { deps, findByID, communityRead };
}

const issue = {
  id: "2",
  communityId: "c",
  magazine: "1",
  status: "published",
  visibility: "teaser",
  publicConfirmedAt: null,
};

describe("issue facts and origin", () => {
  it("reads checked facts without resolving viewer access", async () => {
    const { deps, findByID, communityRead } = fixture(issue);
    expect(await loadIssueFactsById(deps, 2)).toEqual({
      id: 2,
      communityId: "c",
      magazineId: 1,
      status: "published",
      visibility: "teaser",
      publicConfirmedAt: null,
    });
    expect(findByID).toHaveBeenCalledOnce();
    expect(communityRead).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...issue, status: "unknown" },
    { ...issue, visibility: "unknown" },
  ])("refuses missing or invalid facts (%j)", async (row) => {
    expect(await loadIssueFactsById(fixture(row).deps, 2)).toBeNull();
  });

  it("projects only facts for the issue origin", async () => {
    const { deps, communityRead } = fixture(issue);
    expect(await issueOrigin(deps, 2)).toEqual({
      issueId: 2,
      magazineId: 1,
      communityId: "c",
      published: true,
    });
    expect(communityRead).not.toHaveBeenCalled();
  });

  it.each([
    [issue, "c", 1, true],
    [{ ...issue, status: "draft" }, "c", 1, false],
    [issue, "other", 1, false],
    [issue, "c", 3, false],
    [{ ...issue, magazine: null }, "c", 1, false],
  ] as const)(
    "verifies the published magazine and community (%j, %s, %s)",
    async (row, communityId, magazineId, valid) => {
      const source = { via: "magazine" as const, magazineId, issueId: 2 };
      expect(
        await verifyMagazineJoinSource(fixture(row).deps, communityId, source),
      ).toEqual(valid ? source : null);
    },
  );
});
