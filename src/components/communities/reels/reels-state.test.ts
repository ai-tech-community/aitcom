import { describe, expect, it } from "vitest";

import {
  parseReelPostId,
  replaceReelVideo,
  toggleLikeInPages,
} from "./reels-state";

describe("parseReelPostId", () => {
  it("reads a positive whole post id", () => {
    expect(parseReelPostId("42")).toBe(42);
  });

  it("ignores anything else", () => {
    for (const raw of [undefined, "", "0", "-3", "1.5", "abc", "12abc"]) {
      expect(parseReelPostId(raw)).toBeNull();
    }
  });

  it("uses the first value of a repeated parameter", () => {
    expect(parseReelPostId(["7", "8"])).toBe(7);
  });
});

describe("toggleLikeInPages", () => {
  const data = {
    pageParams: [null],
    pages: [
      {
        notice: null,
        nextCursor: null,
        items: [
          { id: 1, hasLiked: false, likeCount: 2 },
          { id: 2, hasLiked: true, likeCount: 5 },
        ],
      },
    ],
  };

  it("flips the like on one reel and moves its count", () => {
    const next = toggleLikeInPages(data, 1)!;
    expect(next.pages[0]!.items[0]).toMatchObject({
      hasLiked: true,
      likeCount: 3,
    });
    expect(toggleLikeInPages(data, 2)!.pages[0]!.items[1]).toMatchObject({
      hasLiked: false,
      likeCount: 4,
    });
  });

  it("leaves other reels and the input untouched", () => {
    const next = toggleLikeInPages(data, 1)!;
    expect(next.pages[0]!.items[1]).toBe(data.pages[0]!.items[1]);
    expect(data.pages[0]!.items[0]!.hasLiked).toBe(false);
  });

  it("passes through when nothing is cached", () => {
    expect(toggleLikeInPages(undefined, 1)).toBeUndefined();
  });
});

describe("replaceReelVideo", () => {
  const a = { id: 1, video: { url: "a-old" } };
  const b = { id: 2, video: { url: "b-old" } };
  const data = { pageParams: [null], pages: [{ items: [a] }, { items: [b] }] };

  it("swaps only the expired reel's links", () => {
    const next = replaceReelVideo(data, 2, { url: "b-new" })!;
    expect(next.pages[1]!.items[0]!.video.url).toBe("b-new");
    expect(next.pages[0]).toBe(data.pages[0]);
    expect(next.pages[0]!.items[0]).toBe(a);
    expect(b.video.url).toBe("b-old");
  });
});
