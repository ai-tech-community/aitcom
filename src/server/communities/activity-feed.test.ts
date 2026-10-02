import { describe, expect, it, vi } from "vitest";

import { loadActivityStream, loadCommunityActivity } from "./activity-feed";
import { postVisibilityWhere, type FeedViewer } from "./post-visibility";

function fakeDatabase() {
  const chain: Record<string, unknown> = {};
  for (const step of [
    "select",
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
  ]) {
    chain[step] = () => chain;
  }
  chain.limit = () => Promise.resolve([]);
  return chain as never;
}

const storage = {
  playbackUrl: vi.fn(),
  presignUpload: vi.fn(),
  inspect: vi.fn(),
  remove: vi.fn(),
};

async function feedPostQueries(viewer: FeedViewer) {
  const find = vi.fn().mockResolvedValue({ docs: [] });
  await loadCommunityActivity({
    database: fakeDatabase(),
    payload: { find } as never,
    community: { id: "c1", slug: "makers" },
    viewerId: viewer.userId ?? "",
    viewer,
    storage: () => storage,
    cursor: null,
    limit: 15,
  });
  return find.mock.calls
    .map(([args]) => args as { collection: string; where: { and: unknown[] } })
    .filter((args) => args.collection === "feed-posts");
}

describe("loadCommunityActivity visibility", () => {
  it("applies the shared visibility filter to both the stream and the pinned posts", async () => {
    const viewer = { userId: "u1", isMember: true, isModerator: false };
    const queries = await feedPostQueries(viewer);

    const stream = queries.find((q) =>
      q.where.and.some(
        (c) => JSON.stringify(c) === '{"isPinned":{"not_equals":true}}',
      ),
    );
    const pinned = queries.find((q) =>
      q.where.and.some(
        (c) => JSON.stringify(c) === '{"isPinned":{"equals":true}}',
      ),
    );
    expect(queries).toHaveLength(2);
    expect(stream!.where.and).toContainEqual(postVisibilityWhere(viewer));
    expect(pinned!.where.and).toContainEqual(postVisibilityWhere(viewer));
  });

  it("hides reported posts from members but not from moderators", async () => {
    const hidesReported = (where: { and: unknown[] }) =>
      JSON.stringify(where).includes('"hiddenAt":{"exists":false}');

    const member = await feedPostQueries({
      userId: "u1",
      isMember: true,
      isModerator: false,
    });
    const moderator = await feedPostQueries({
      userId: "m1",
      isMember: true,
      isModerator: true,
    });

    expect(member.every((q) => hidesReported(q.where))).toBe(true);
    expect(moderator.some((q) => hidesReported(q.where))).toBe(false);
  });
});

describe("loadActivityStream across communities", () => {
  const member = (userId: string) => ({
    userId,
    isMember: true,
    isModerator: false,
  });
  const moderator = (userId: string) => ({
    userId,
    isMember: true,
    isModerator: true,
  });

  type FindArgs = { collection: string; where: unknown };

  async function streamQueries(
    scopes: Parameters<typeof loadActivityStream>[0]["scopes"],
    docs: Record<string, unknown[]> = {},
  ) {
    const find = vi.fn(async (args: FindArgs) => ({
      docs: docs[args.collection] ?? [],
    }));
    const page = await loadActivityStream({
      database: fakeDatabase(),
      payload: { find } as never,
      scopes,
      viewerId: "u1",
      storage: () => storage,
      cursor: null,
      limit: 15,
    });
    const byCollection = (name: string) =>
      find.mock.calls
        .map(([args]) => args)
        .filter((args) => args.collection === name);
    return { find, page, byCollection };
  }

  it("reads each source once for the whole set, with the set's ids", async () => {
    const { find, byCollection } = await streamQueries([
      { id: "c1", slug: "makers", viewer: member("u1") },
      { id: "c2", slug: "builders", viewer: member("u1") },
    ]);

    expect(find).toHaveBeenCalledTimes(4);
    const [posts] = byCollection("feed-posts");
    expect((posts!.where as { and: unknown[] }).and).toContainEqual({
      communityId: { in: ["c1", "c2"] },
    });
    expect(byCollection("community-ideas")[0]!.where).toEqual({
      and: [{ communityId: { in: ["c1", "c2"] } }],
    });
    expect(
      (byCollection("events")[0]!.where as { and: unknown[] }).and,
    ).toContainEqual({ communityId: { in: ["c1", "c2"] } });
    expect(
      (byCollection("forum-threads")[0]!.where as { and: unknown[] }).and,
    ).toContainEqual({ communityId: { in: ["c1", "c2"] } });
  });

  it("applies the moderator rule only in the communities the viewer moderates", async () => {
    const { byCollection } = await streamQueries([
      { id: "c1", slug: "makers", viewer: member("u1") },
      { id: "c2", slug: "builders", viewer: moderator("u1") },
      { id: "c3", slug: "writers", viewer: member("u1") },
    ]);
    const [posts] = byCollection("feed-posts");
    expect((posts!.where as { and: unknown[] }).and).toContainEqual({
      or: [
        {
          and: [
            { communityId: { in: ["c1", "c3"] } },
            postVisibilityWhere(member("u1")),
          ],
        },
        {
          and: [
            { communityId: { in: ["c2"] } },
            postVisibilityWhere(moderator("u1")),
          ],
        },
      ],
    });
  });

  it("labels each item with its community, and unscoped threads with the Hub", async () => {
    const at = "2026-09-23T12:00:00.000Z";
    const { page, byCollection } = await streamQueries(
      [
        { id: "c1", slug: "makers", viewer: member("u1") },
        { id: "hub", slug: "ait", viewer: member("u1") },
      ],
      {
        "forum-threads": [
          { id: 1, title: "Scoped", communityId: "c1", createdAt: at },
          { id: 2, title: "Legacy", communityId: null, createdAt: at },
        ],
        "community-ideas": [
          { id: 3, title: "Idea", communityId: "c1", createdAt: at },
        ],
      },
    );

    expect(
      (byCollection("forum-threads")[0]!.where as { and: unknown[] }).and,
    ).toContainEqual({
      or: [
        { communityId: { in: ["c1", "hub"] } },
        { communityId: { exists: false } },
      ],
    });
    expect(
      Object.fromEntries(
        page.items.map((item) => [item.key, item.communityId]),
      ),
    ).toEqual({ "thread:1": "c1", "thread:2": "hub", "idea:3": "c1" });
  });

  it("reads nothing for an empty set", async () => {
    const { find, page } = await streamQueries([]);
    expect(find).not.toHaveBeenCalled();
    expect(page).toEqual({ items: [], nextCursor: null });
  });
});
