import { describe, expect, it } from "vitest";

import { canPostToFeed, requireActiveFeedMember } from "./feed-posts";

describe("canPostToFeed", () => {
  it("lets every member post when the policy is all_members", () => {
    expect(canPostToFeed("all_members", "member")).toBe(true);
  });
  it("limits admins_only communities to owners, admins, and moderators", () => {
    expect(canPostToFeed("admins_only", "member")).toBe(false);
    expect(canPostToFeed("admins_only", "moderator")).toBe(true);
    expect(canPostToFeed("admins_only", "owner")).toBe(true);
  });
});

describe("requireActiveFeedMember", () => {
  it("refuses a non-member with a neutral message (used for reading and posting)", async () => {
    const database = {
      query: {
        communities: {
          findFirst: async () => ({
            id: "c1",
            slug: "makers",
            feedPostPolicy: "all_members",
          }),
        },
        communityMemberships: { findFirst: async () => undefined },
      },
    };
    await expect(
      requireActiveFeedMember(database as never, "makers", "u1"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Must be an active community member",
    });
  });
});
