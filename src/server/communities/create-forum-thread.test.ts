import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

import {
  forumThreadDraftMeta,
  forumThreadFromDraft,
  forumThreadSlug,
  threadCommunityId,
} from "./forum-thread-draft";

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

  it("stores a thread draft the owner can approve into the same thread", () => {
    const meta = forumThreadDraftMeta({
      title: "Hello there",
      content: "A full thread body.",
      category: "question",
      communitySlug: "makers",
      communityName: "Makers",
    });
    expect(meta.destinationPath).toBe("/communities/makers/forum");
    expect(
      forumThreadFromDraft({
        content: "A full thread body.",
        metadata: meta,
      }),
    ).toEqual({
      title: "Hello there",
      content: "A full thread body.",
      category: "question",
      communitySlug: "makers",
    });
  });

  it("refuses to publish a thread draft that lost its title", () => {
    expect(() =>
      forumThreadFromDraft({
        content: "Body",
        metadata: { category: "general" },
      }),
    ).toThrow(TRPCError);
  });
});
