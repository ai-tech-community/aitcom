import { describe, expect, it, vi } from "vitest";

import { loadCommunityActivity } from "./activity-feed";
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
    storage,
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
