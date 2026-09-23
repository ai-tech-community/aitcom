import { describe, expect, it } from "vitest";

import {
  canViewPost,
  feedViewerFor,
  isModeratorRole,
  postVisibilityWhere,
  type FeedViewer,
} from "./post-visibility";

const member: FeedViewer = { userId: "m", isMember: true, isModerator: false };
const mod: FeedViewer = { userId: "mod", isMember: true, isModerator: true };
const visitor: FeedViewer = { userId: null, isMember: false, isModerator: false };
const signedInOutsider: FeedViewer = { userId: "o", isMember: false, isModerator: false };

const post = (over: Record<string, unknown> = {}) => ({
  authorId: "a",
  isDeleted: false,
  hiddenAt: null,
  visibility: "community",
  ...over,
});

describe("canViewPost", () => {
  it("shows community-only posts to members, never to non-members", () => {
    expect(canViewPost(post(), member)).toBe(true);
    expect(canViewPost(post(), visitor)).toBe(false);
    expect(canViewPost(post(), signedInOutsider)).toBe(false);
    expect(canViewPost(post({ visibility: "public" }), visitor)).toBe(true);
  });

  it("hides reported posts from everyone except the author and moderators", () => {
    const hidden = post({ hiddenAt: "2026-09-24T00:00:00.000Z", visibility: "public" });
    expect(canViewPost(hidden, member)).toBe(false);
    expect(canViewPost(hidden, visitor)).toBe(false);
    expect(canViewPost(hidden, mod)).toBe(true);
    expect(canViewPost(hidden, { ...member, userId: "a" })).toBe(true);
  });

  it("never shows deleted posts", () => {
    expect(canViewPost(post({ isDeleted: true }), mod)).toBe(false);
  });
});

describe("postVisibilityWhere", () => {
  it("members: not deleted, and not hidden unless their own", () => {
    expect(postVisibilityWhere(member)).toEqual({
      and: [
        { isDeleted: { not_equals: true } },
        { or: [{ hiddenAt: { exists: false } }, { authorId: { equals: "m" } }] },
      ],
    });
  });

  it("moderators see hidden posts", () => {
    expect(postVisibilityWhere(mod)).toEqual({
      and: [{ isDeleted: { not_equals: true } }],
    });
  });

  it("visitors: public and not hidden only", () => {
    expect(postVisibilityWhere(visitor)).toEqual({
      and: [
        { isDeleted: { not_equals: true } },
        { or: [{ hiddenAt: { exists: false } }] },
        { visibility: { equals: "public" } },
      ],
    });
  });

  it("knows which roles moderate", () => {
    expect(["owner", "admin", "moderator"].every(isModeratorRole)).toBe(true);
    expect(isModeratorRole("member")).toBe(false);
    expect(isModeratorRole(null)).toBe(false);
  });
});

describe("feedViewerFor", () => {
  it("derives the viewer from an active membership, or its absence", () => {
    expect(feedViewerFor("u", { role: "moderator" })).toEqual({
      userId: "u",
      isMember: true,
      isModerator: true,
    });
    expect(feedViewerFor("u", { role: "member" })).toEqual({
      userId: "u",
      isMember: true,
      isModerator: false,
    });
    expect(feedViewerFor("u", null)).toEqual({
      userId: "u",
      isMember: false,
      isModerator: false,
    });
    expect(feedViewerFor("u", undefined)).toEqual({
      userId: "u",
      isMember: false,
      isModerator: false,
    });
  });
});
