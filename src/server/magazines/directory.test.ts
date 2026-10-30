import type { Where } from "payload";
import { describe, expect, it, vi } from "vitest";

import type { Deps } from "./deps";
import type * as ReadableIssuesModule from "./readable-issues";
import { loadIssueReadScope, type IssueReadScope } from "./readable-issues";
import { loadMagazinesHome } from "./reading";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("./readable-issues", async (original) => ({
  ...(await original<typeof ReadableIssuesModule>()),
  loadIssueReadScope: vi.fn(),
}));

function matches(where: Where, row: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "and")
      return (condition as Where[]).every((part) => matches(part, row));
    if (field === "or")
      return (condition as Where[]).some((part) => matches(part, row));
    const op = condition as {
      equals?: unknown;
      in?: unknown[];
      not_in?: unknown[];
      exists?: boolean;
    };
    if ("equals" in op) return row[field] === op.equals;
    if (op.in) return op.in.includes(row[field]);
    if (op.not_in) return !op.not_in.includes(row[field]);
    if ("exists" in op) return (row[field] != null) === op.exists;
    throw new Error(`Unexpected predicate on ${field}`);
  });
}

function fixture() {
  const communities = ["private", "other", "public", "deleted"].map((id) => ({
    id,
    name: id,
    slug: id,
    isListedInDirectory: id === "public",
  }));
  const magazines = ["private", "other", "public", "private", "deleted"].map(
    (communityId, i) => ({
      id: i + 1,
      communityId,
      name: `Magazine ${i + 1}`,
      slug: `magazine-${i + 1}`,
      listingHidden: i === 3,
      topics: [{ topic: communityId === "private" ? "members" : "news" }],
    }),
  );
  const issues = [
    { id: 7, magazine: 1, communityId: "private", status: "draft" },
    { id: 6, magazine: 5, communityId: "deleted" },
    { id: 5, magazine: 4, communityId: "private" },
    { id: 4, magazine: 1, communityId: "private" },
    { id: 3, magazine: 2, communityId: "other" },
    { id: 2, magazine: 3, communityId: "public", visibility: "public" },
    { id: 1, magazine: 1, communityId: "private", visibility: "public" },
  ].map((row) => ({
    status: "published",
    visibility: "members",
    title: `Issue ${row.id}`,
    slug: `issue-${row.id}`,
    number: row.id,
    coverImageUrl: `/cover-${row.id}.jpg`,
    ...row,
  }));
  const scope: IssueReadScope = {
    editorCommunityIds: [],
    memberCommunityIds: [],
    privateCommunityIds: ["private", "other"],
    deletedCommunityIds: ["deleted"],
  };
  vi.mocked(loadIssueReadScope).mockImplementation(async (_db, viewerId) => ({
    ...scope,
    memberCommunityIds: viewerId === "member" ? ["private"] : [],
    editorCommunityIds: viewerId === "editor" ? ["private"] : [],
  }));
  const find = vi.fn(async (input: { collection: string; where: Where }) => ({
    docs: (input.collection === "magazines" ? magazines : issues).filter(
      (row) => matches(input.where, row),
    ),
  }));
  return {
    deps: {
      payload: { find },
      db: { query: { communities: { findMany: async () => communities } } },
    } as unknown as Deps,
  };
}

describe("magazine directory access", () => {
  it.each(["member", "editor"])(
    "shows private published issues to their %s without exposing drafts or staff-hidden magazines",
    async (viewerId) => {
      const { deps } = fixture();
      const opts = { locale: "en" as const, viewerId };
      const result = await loadMagazinesHome(deps, opts);
      expect(result.magazines.map((m) => m.id)).toEqual([1, 3]);
      expect(result.featured?.id).toBe(4);
      expect(result.justPublished.map((i) => i.id)).toEqual([2, 1]);
      expect(result.magazines[0]?.latest.outsiderReach).toBe("none");
    },
  );

  it.each([null, "outsider", "former-member"])(
    "keeps private issues hidden from %s",
    async (viewerId) => {
      const { deps } = fixture();
      const opts = { locale: "en" as const, viewerId };
      const result = await loadMagazinesHome(deps, opts);
      expect(result.magazines.map((m) => m.id)).toEqual([3]);
      expect(result.featured?.id).toBe(2);
      expect(result.topics).toEqual(["news"]);
    },
  );

  it("includes member-visible magazines in topic filters", async () => {
    const { deps } = fixture();
    const opts = {
      locale: "en" as const,
      viewerId: "member",
      topic: "members",
    };
    const result = await loadMagazinesHome(deps, opts);
    expect(result.magazines.map((m) => m.id)).toEqual([1]);
    expect(result.topics).toEqual(["members", "news"]);
  });

  it("defaults to anonymous access for public discovery callers", async () => {
    const { deps } = fixture();
    const result = await loadMagazinesHome(deps, { locale: "en" });
    expect(result.magazines.map((m) => m.id)).toEqual([3]);
  });
});
