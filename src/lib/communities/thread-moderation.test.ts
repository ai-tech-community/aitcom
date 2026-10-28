import { describe, expect, it } from "vitest";

import {
  forumThreadIsLive,
  pinThreadDenial,
  roleCanModerateThreads,
} from "./thread-moderation";

describe("live threads", () => {
  it("pins a community thread only while the thread and its community are live", () => {
    expect(
      forumThreadIsLive(
        { isDeleted: false, communityId: "c1" },
        { deletedAt: null },
      ),
    ).toBe(true);
    expect(
      forumThreadIsLive({ isDeleted: false, communityId: null }, null),
    ).toBe(true);
    expect(
      forumThreadIsLive(
        { isDeleted: true, communityId: "c1" },
        { deletedAt: null },
      ),
    ).toBe(false);
    expect(
      forumThreadIsLive({ isDeleted: false, communityId: "c1" }, null),
    ).toBe(false);
    expect(
      forumThreadIsLive(
        { isDeleted: false, communityId: "c1" },
        { deletedAt: new Date() },
      ),
    ).toBe(false);
    expect(forumThreadIsLive(null, null)).toBe(false);
  });
});

describe("thread pin roles", () => {
  it("matches the forum pin control: owner, admin, and moderator", () => {
    expect(roleCanModerateThreads("owner")).toBe(true);
    expect(roleCanModerateThreads("admin")).toBe(true);
    expect(roleCanModerateThreads("moderator")).toBe(true);
    expect(roleCanModerateThreads("member")).toBe(false);
    expect(roleCanModerateThreads(null)).toBe(false);
  });

  it("refuses a community thread when the member cannot pin in the UI", () => {
    expect(
      pinThreadDenial({
        communityId: "c1",
        role: "member",
        allowHubThread: false,
      }),
    ).toBe("forbidden");
    expect(
      pinThreadDenial({
        communityId: "c1",
        role: null,
        allowHubThread: true,
      }),
    ).toBe("forbidden");
  });

  it("allows a community moderator to pin or unpin", () => {
    expect(
      pinThreadDenial({
        communityId: "c1",
        role: "moderator",
        allowHubThread: false,
      }),
    ).toBeNull();
  });

  it("refuses a hub thread on the MCP tool and allows it on the browser procedure", () => {
    expect(
      pinThreadDenial({
        communityId: null,
        role: null,
        allowHubThread: false,
      }),
    ).toBe("not_community");
    expect(
      pinThreadDenial({
        communityId: null,
        role: null,
        allowHubThread: true,
      }),
    ).toBeNull();
  });
});
