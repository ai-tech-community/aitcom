import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

import { forumThreadSlug, threadCommunityId } from "./forum-thread-draft";

describe("forum thread create", () => {
  it("builds the same slug stem the forum form stores", () => {
    expect(forumThreadSlug("Hello, World!", 1_700_000_000_000)).toBe(
      "hello-world-1700000000000",
    );
  });

  it("keeps a missing community slug as a hub thread", () => {
    expect(threadCommunityId(undefined, undefined)).toBeUndefined();
  });

  it("refuses a community slug that does not name a live community", () => {
    expect(() => threadCommunityId("missing", null)).toThrow(TRPCError);
    try {
      threadCommunityId("missing", null);
    } catch (error) {
      expect(error).toMatchObject({
        code: "NOT_FOUND",
        message: "Community not found",
      });
    }
  });

  it("uses the community id when the slug matches", () => {
    expect(threadCommunityId("makers", { id: "c1" })).toBe("c1");
  });
});
