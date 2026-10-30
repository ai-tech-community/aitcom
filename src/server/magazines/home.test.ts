import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Magazine, MagazineIssue } from "@/payload-types";
import type { Deps } from "./deps";
import { loadHomepageMagazines } from "./reading";
import { loadIssueReadScope, readableIssueWhere } from "./readable-issues";
import { hiddenMagazineIds } from "./listing";
import type * as ReadableIssuesModule from "./readable-issues";
import type * as ListingModule from "./listing";

vi.mock("@/server/db", () => ({ db: {} }));

vi.mock("./readable-issues", async (original) => ({
  ...(await original<typeof ReadableIssuesModule>()),
  loadIssueReadScope: vi.fn(),
}));
vi.mock("./listing", async (original) => ({
  ...(await original<typeof ListingModule>()),
  hiddenMagazineIds: vi.fn(),
}));

const scope = {
  editorCommunityIds: [],
  memberCommunityIds: [],
  privateCommunityIds: ["private"],
  deletedCommunityIds: ["deleted"],
};
const community = {
  id: "public",
  name: "Community",
  slug: "public",
  isListedInDirectory: true,
};
function issue(id: number, magazine = id): MagazineIssue {
  return {
    id,
    magazine,
    communityId: "public",
    number: id,
    title: `Issue ${id}`,
    slug: `issue-${id}`,
    status: "published",
    visibility: "public",
    publishedAt: "2026-10-28T12:00:00Z",
    createdAt: "2026-10-28T12:00:00Z",
    updatedAt: "2026-10-28T12:00:00Z",
  };
}
function magazine(id: number): Magazine {
  return {
    id,
    communityId: "public",
    name: `Magazine ${id}`,
    slug: `magazine-${id}`,
    createdBy: "owner",
    createdAt: "2026-10-28T12:00:00Z",
    updatedAt: "2026-10-28T12:00:00Z",
  };
}
function fixture(
  issues = [
    issue(10, 1),
    issue(9, 1),
    issue(8, 2),
    issue(7, 3),
    issue(6, 4),
    issue(5, 5),
  ],
  magazines = [1, 2, 3, 4].map(magazine),
) {
  const find = vi
    .fn()
    .mockResolvedValueOnce({ docs: issues })
    .mockResolvedValueOnce({ docs: magazines });
  const findMany = vi.fn().mockResolvedValue([community]);
  const deps = {
    payload: { find },
    db: { query: { communities: { findMany } } },
  } as unknown as Deps;
  return { deps, find, findMany };
}
beforeEach(() => {
  vi.mocked(loadIssueReadScope).mockReset().mockResolvedValue(scope);
  vi.mocked(hiddenMagazineIds).mockReset().mockResolvedValue([99]);
});
describe("loadHomepageMagazines", () => {
  it("loads a bounded lightweight anonymous shelf, deduplicating newest issues in order", async () => {
    const fx = fixture();
    const result = await loadHomepageMagazines(fx.deps, "nl");
    expect(result.map((m) => [m.id, m.latest.id])).toEqual([
      [1, 10],
      [2, 8],
      [3, 7],
      [4, 6],
    ]);
    expect(loadIssueReadScope).toHaveBeenCalledWith(fx.deps.db, null);
    expect(fx.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: "magazine-issues",
        limit: 40,
        pagination: false,
        depth: 0,
        locale: "nl",
        where: {
          and: [
            readableIssueWhere(scope, "teaser"),
            { status: { equals: "published" } },
            { magazine: { not_in: [99] } },
          ],
        },
      }),
    );
    const select = fx.find.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty("items");
    expect(select).not.toHaveProperty("editorNote");
    expect(select).toHaveProperty("publicConfirmedAt", true);
    expect(fx.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: "magazines",
        limit: 4,
        where: { id: { in: [1, 2, 3, 4] } },
      }),
    );
    expect(fx.find).toHaveBeenCalledTimes(2);
  });
  it("omits hidden, missing and non-readable cards even when a row changes between reads", async () => {
    const fx = fixture(
      [issue(1), { ...issue(2), visibility: "members" }, issue(3), issue(4)],
      [
        { ...magazine(1), listingHidden: true },
        magazine(2),
        { ...magazine(3), communityId: "missing" },
        magazine(4),
      ],
    );
    expect(
      (await loadHomepageMagazines(fx.deps, "en")).map((m) => m.id),
    ).toEqual([4]);
  });
  it("stops early when no readable issues exist", async () => {
    const fx = fixture([]);
    expect(await loadHomepageMagazines(fx.deps, "en")).toEqual([]);
    expect(fx.find).toHaveBeenCalledTimes(1);
    expect(fx.findMany).not.toHaveBeenCalled();
  });
  it("keeps confirmed previews and rejects unconfirmed private-community issues", async () => {
    const fx = fixture(
      [
        issue(1),
        {
          ...issue(2),
          visibility: "teaser",
          publicConfirmedAt: "2026-10-28T12:00:00Z",
        },
        { ...issue(3), publicConfirmedAt: "2026-10-28T12:00:00Z" },
      ],
      [1, 2, 3].map(magazine),
    );
    fx.findMany.mockResolvedValue([
      { ...community, isListedInDirectory: false },
    ]);
    const result = await loadHomepageMagazines(fx.deps, "en");
    expect(result.map((m) => [m.id, m.latest.outsiderReach])).toEqual([
      [2, "teaser"],
      [3, "full"],
    ]);
  });
  it("logs an optional-feed failure and returns an empty shelf", async () => {
    const fx = fixture();
    const error = new Error("magazines unavailable");
    fx.find.mockReset().mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(loadHomepageMagazines(fx.deps, "en")).resolves.toEqual([]);
      expect(log).toHaveBeenCalledWith("home: could not load magazines", error);
    } finally {
      log.mockRestore();
    }
  });
});
