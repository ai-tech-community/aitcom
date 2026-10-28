import { describe, expect, it } from "vitest";

import { pinThreadDenial, roleCanModerateThreads } from "./thread-moderation";

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
