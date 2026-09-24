import { describe, expect, it, vi } from "vitest";

vi.mock("./feed-posts", () => ({
  decorateFeedPosts: vi.fn((_db, _p, posts: object[]) =>
    Promise.resolve(posts.map((p) => ({ ...p }))),
  ),
}));

import { decorateFeedPosts } from "./feed-posts";
import { OUTSIDE_VIEWER, type FeedViewer } from "./post-visibility";
import { listReels } from "./reels";

const visitor = OUTSIDE_VIEWER;
const member: FeedViewer = { userId: "m", isMember: true, isModerator: false };
const moderator: FeedViewer = {
  userId: "mod",
  isMember: true,
  isModerator: true,
};
const video = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  authorId: "a",
  communityId: "c1",
  createdAt: `2026-09-2${id}T00:00:00.000Z`,
  visibility: "public",
  hiddenAt: null,
  isDeleted: false,
  video: { key: `${id}.mp4` },
  ...over,
});

function deps(docs: unknown[], byId: Record<number, unknown> = {}) {
  const payload = {
    find: vi.fn().mockResolvedValue({ docs }),
    findByID: vi
      .fn()
      .mockImplementation(({ id }: { id: number }) =>
        byId[id] ? Promise.resolve(byId[id]) : Promise.reject(new Error("nf")),
      ),
  };
  const storage = vi.fn();
  return {
    payload,
    storage,
    deps: {
      database: {} as never,
      payload: payload as never,
      storage: storage as never,
    },
  };
}

describe("listReels", () => {
  it("asks for video posts only, filtered by the visitor's visibility", async () => {
    const { deps: d, payload } = deps([video(3), video(2)]);
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: visitor,
      cursor: null,
      startAtPostId: null,
      limit: 1,
    });
    const where = JSON.stringify(payload.find.mock.calls[0]![0].where);
    expect(where).toContain('"communityId":{"equals":"c1"}');
    expect(where).toContain('"visibility":{"equals":"public"}');
    expect(where).toContain('"video.key":{"exists":true}');
    expect(page.items.map((p) => p.id)).toEqual([3]);
    expect(page.nextCursor).toEqual({ createdAt: video(3).createdAt, id: 3 });
    expect(page.notice).toBeNull();
  });

  it("passes the viewer and the lazy storage source to decoration", async () => {
    const { deps: d, storage } = deps([video(2)]);
    await listReels(d, {
      community: { id: "c1" },
      viewer: member,
      cursor: null,
      startAtPostId: null,
      limit: 5,
    });
    const call = vi.mocked(decorateFeedPosts).mock.calls.at(-1)!;
    expect(call[3]).toBe("m");
    expect(call[4]).toBe(storage);
    expect(storage).not.toHaveBeenCalled();
  });

  it("continues after the cursor", async () => {
    const { deps: d, payload } = deps([video(1)]);
    const cursor = { createdAt: video(2).createdAt, id: 2 };
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: member,
      cursor,
      startAtPostId: 3,
      limit: 5,
    });
    const where = JSON.stringify(payload.find.mock.calls[0]![0].where);
    expect(where).toContain(`"createdAt":{"less_than":"${cursor.createdAt}"}`);
    // A cursor means a later page: the deep link is not loaded again.
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(page.items.map((p) => p.id)).toEqual([1]);
    expect(page.nextCursor).toBeNull();
  });

  it("starts at a deep-linked video the viewer may see", async () => {
    const { deps: d, payload } = deps([video(2)], { 3: video(3) });
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: member,
      cursor: null,
      startAtPostId: 3,
      limit: 5,
    });
    expect(page.items.map((p) => p.id)).toEqual([3, 2]);
    const where = JSON.stringify(payload.find.mock.calls[0]![0].where);
    expect(where).toContain(
      `"createdAt":{"less_than":"${video(3).createdAt}"}`,
    );
  });

  it("says 'members only' for a community-only deep link opened by a visitor", async () => {
    const { deps: d, payload } = deps([], {
      3: video(3, { visibility: "community" }),
    });
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: visitor,
      cursor: null,
      startAtPostId: 3,
      limit: 5,
    });
    expect(page.notice).toBe("members_only");
    expect(page.items).toEqual([]);
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("says 'unavailable' for a hidden (reported) public video, never showing it", async () => {
    const { deps: d } = deps([], {
      3: video(3, { hiddenAt: "2026-09-24T00:00:00.000Z" }),
    });
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: visitor,
      cursor: null,
      startAtPostId: 3,
      limit: 5,
    });
    expect(page.notice).toBe("unavailable");
    expect(page.items).toEqual([]);
  });

  it("shows a hidden video to a moderator of its community", async () => {
    const { deps: d } = deps([], {
      3: video(3, {
        visibility: "community",
        hiddenAt: "2026-09-24T00:00:00.000Z",
      }),
    });
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: moderator,
      cursor: null,
      startAtPostId: 3,
      limit: 5,
    });
    expect(page.notice).toBeNull();
    expect(page.items.map((p) => p.id)).toEqual([3]);
  });

  it("says 'unavailable' for a deleted video", async () => {
    const { deps: d } = deps([], {
      3: video(3, { visibility: "community", isDeleted: true }),
    });
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: visitor,
      cursor: null,
      startAtPostId: 3,
      limit: 5,
    });
    expect(page.notice).toBe("unavailable");
  });

  it("treats a deep link to another community's post as unavailable", async () => {
    const { deps: d } = deps([], { 3: video(3, { communityId: "other" }) });
    const page = await listReels(d, {
      community: { id: "c1" },
      viewer: member,
      cursor: null,
      startAtPostId: 3,
      limit: 5,
    });
    expect(page.notice).toBe("unavailable");
  });

  it("treats a deep link to a text post or a missing post as unavailable", async () => {
    const { deps: d } = deps([], { 3: video(3, { video: {} }) });
    for (const startAtPostId of [3, 99]) {
      const page = await listReels(d, {
        community: { id: "c1" },
        viewer: member,
        cursor: null,
        startAtPostId,
        limit: 5,
      });
      expect(page.notice).toBe("unavailable");
      expect(page.items).toEqual([]);
    }
  });
});
