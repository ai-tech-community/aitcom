import { describe, expect, it, vi } from "vitest";
import { loadProfilePosts, profilePostsWhere } from "./profile-posts";

vi.mock("@/server/communities/content-visibility-queries", () => ({
  COMMUNITY_VISIBILITY_COLUMNS: {},
  activeMemberCommunityIds: () => Promise.resolve(new Set<string>()),
  hiddenContentCommunityIds: () => Promise.resolve([]),
  viewerCanReadContent: () => Promise.resolve(true),
}));

describe("profile post visibility", () => {
  it("scopes signed-out snippets to public, non-hidden posts by the profile author", () => {
    expect(profilePostsWhere("author", null, [], ["closed"])).toEqual({
      and: [
        { authorId: { equals: "author" } },
        { communityId: { exists: true } },
        { hiddenAt: { exists: false } },
        { communityId: { not_in: ["closed"] } },
        {
          or: [
            {
              and: [
                { isDeleted: { not_equals: true } },
                { or: [{ hiddenAt: { exists: false } }] },
                { visibility: { equals: "public" } },
              ],
            },
          ],
        },
      ],
    });
  });

  it("allows community-only snippets under active membership scopes", () => {
    const where = profilePostsWhere("author", "viewer", ["member-of"], []);
    expect(where.and?.at(-1)?.or?.[1]?.and?.[0]).toEqual({
      communityId: { in: ["member-of"] },
    });
    expect(where.and?.at(-1)?.or?.[1]?.and?.[1]).toHaveProperty("and");
  });

  it("continues past unavailable communities and takes the three newest readable posts", async () => {
    const posts = (communityId: string, ids: number[]) =>
      ids.map((id) => ({
        id,
        communityId,
        content: "Workbench update",
        createdAt: "2026-11-28T00:00:00Z",
      }));
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        docs: posts("unavailable", [8, 7, 6, 5]),
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        docs: posts("readable", [4, 3, 2, 1]),
        hasNextPage: false,
      });
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "readable", slug: "workbench-notes", name: "Workbench Notes" },
      ]);
    const result = await loadProfilePosts(
      { query: { communities: { findMany } } } as never,
      { find },
      "author",
      null,
    );
    expect(result.map((post) => post.id)).toEqual([4, 3, 2]);
    expect(find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2 }),
    );
  });
});
