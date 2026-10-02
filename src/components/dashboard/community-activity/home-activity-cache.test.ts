import { describe, expect, it } from "vitest";

import { removePost, setPostLike } from "./home-activity-cache";

const post = (id: number, likeCount = 0) => ({
  kind: "post",
  key: `post:${id}`,
  post: { id, hasLiked: false, likeCount },
});
const thread = { kind: "thread", key: "thread:1" };

const data = () => ({
  pages: [{ items: [post(1), thread] }, { items: [post(2, 3)] }],
  pageParams: [null, { at: "x", key: "post:1" }],
});

describe("setPostLike", () => {
  it("sets the server's like state on that post only", () => {
    const before = data();
    const after = setPostLike(before, 2, { liked: true, likeCount: 4 })!;
    expect(after.pages[1]!.items[0]).toMatchObject({
      post: { id: 2, hasLiked: true, likeCount: 4 },
    });
    expect(after.pages[0]).toBe(before.pages[0]);
    expect(after.pageParams).toBe(before.pageParams);
  });

  it("leaves a thread with the same id alone", () => {
    const before = data();
    const after = setPostLike(before, 1, { liked: true, likeCount: 1 })!;
    expect(after.pages[0]!.items[1]).toBe(thread);
  });

  it("passes an empty cache through", () => {
    expect(setPostLike(undefined, 1, { liked: true, likeCount: 1 })).toBe(
      undefined,
    );
  });
});

describe("removePost", () => {
  it("drops the post and keeps the cursors", () => {
    const before = data();
    const after = removePost(before, 1)!;
    expect(after.pages[0]!.items).toEqual([thread]);
    expect(after.pages[1]).toBe(before.pages[1]);
    expect(after.pageParams).toBe(before.pageParams);
  });
});
