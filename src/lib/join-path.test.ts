import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "@/server/communities/hub";

import {
  HUB_COMMUNITY_PATH,
  getHubCommunityPath,
  getAuthAliasRedirect,
  getJoinDoorRedirect,
  getJoinPageRedirect,
  isMarketingHomePath,
  resolveAuthAlias,
  shouldShowFirstSessionPath,
} from "./join-path";

describe("join path landing", () => {
  it("names the Hub community surface, not the marketing homepage", () => {
    expect(HUB_COMMUNITY_PATH).toBe(`/communities/${HUB_SLUG}`);
    expect(HUB_COMMUNITY_PATH).not.toBe("/");
    expect(getHubCommunityPath("en")).toBe("/en/communities/ait");
    expect(getHubCommunityPath("nl")).toBe("/nl/communities/ait");
  });

  it("treats locale roots as the marketing homepage", () => {
    expect(isMarketingHomePath("/")).toBe(true);
    expect(isMarketingHomePath("/en")).toBe(true);
    expect(isMarketingHomePath("/nl/")).toBe(true);
    expect(isMarketingHomePath("/en?utm=x")).toBe(true);
    expect(isMarketingHomePath("/communities/ait")).toBe(false);
    expect(isMarketingHomePath("/en/communities/ait")).toBe(false);
    expect(isMarketingHomePath("/en/communities")).toBe(false);
  });

  it("sends /join guests to signup and members to Hub", () => {
    expect(getJoinPageRedirect({ hasSession: false, locale: "en" })).toBe(
      "/en/auth/signup",
    );
    expect(getJoinPageRedirect({ hasSession: true, locale: "nl" })).toBe(
      "/nl/communities/ait",
    );
  });

  it("aliases guessed signup / sign-in URLs onto the real auth routes", () => {
    expect(resolveAuthAlias("/signup")).toBe("/auth/signup");
    expect(resolveAuthAlias("/sign-up")).toBe("/auth/signup");
    expect(resolveAuthAlias("/signin")).toBe("/auth/signin");
    expect(resolveAuthAlias("/sign-in")).toBe("/auth/signin");
    expect(resolveAuthAlias("/auth/signup")).toBeNull();
    expect(resolveAuthAlias("/join")).toBeNull();
    expect(getAuthAliasRedirect("/signup")).toBe("/en/auth/signup");
    expect(getAuthAliasRedirect("/sign-in")).toBe("/en/auth/signin");
    expect(
      getAuthAliasRedirect("/nl/signup", "?redirect=/nl/communities/ait"),
    ).toBe("/nl/auth/signup?redirect=/nl/communities/ait");
    expect(getAuthAliasRedirect("/en/auth/signup")).toBeNull();
  });

  it("resolves /en/join and /nl/join as the public door", () => {
    expect(getJoinDoorRedirect("/en/join", false)).toBe("/en/auth/signup");
    expect(getJoinDoorRedirect("/nl/join", false)).toBe("/nl/auth/signup");
    expect(getJoinDoorRedirect("/en/join", true)).toBe("/en/communities/ait");
    expect(getJoinDoorRedirect("/nl/join", true)).toBe("/nl/communities/ait");
    expect(getJoinDoorRedirect("/en/join", false, "?code=abc")).toBe(
      "/en/auth/signup?code=abc",
    );
  });

  it("leaves bare /join for next-intl to prefix into locale", () => {
    expect(getJoinDoorRedirect("/join", false)).toBeNull();
    expect(getJoinDoorRedirect("/join", true)).toBeNull();
    expect(getJoinDoorRedirect("/join/", false)).toBeNull();
  });

  it("does not treat invite-code or other routes as the join door", () => {
    expect(getJoinDoorRedirect("/en/join/abc", false)).toBeNull();
    expect(getJoinDoorRedirect("/join/abc", true)).toBeNull();
    expect(getJoinDoorRedirect("/en/signup", false)).toBeNull();
    expect(getJoinDoorRedirect("/en/communities/ait", false)).toBeNull();
    expect(getJoinDoorRedirect("/en/join/", false)).toBe("/en/auth/signup");
  });

  it("shows the first-session agent path only for Hub members without an agent", () => {
    expect(
      shouldShowFirstSessionPath({
        slug: "ait",
        isMember: true,
        hasAgent: false,
        agentQueryReady: true,
      }),
    ).toBe(true);
    expect(
      shouldShowFirstSessionPath({
        slug: "ait",
        isMember: true,
        hasAgent: true,
        agentQueryReady: true,
      }),
    ).toBe(false);
    expect(
      shouldShowFirstSessionPath({
        slug: "ait",
        isMember: false,
        hasAgent: false,
        agentQueryReady: true,
      }),
    ).toBe(false);
    expect(
      shouldShowFirstSessionPath({
        slug: "rotterdam",
        isMember: true,
        hasAgent: false,
        agentQueryReady: true,
      }),
    ).toBe(false);
    expect(
      shouldShowFirstSessionPath({
        slug: "ait",
        isMember: true,
        hasAgent: undefined,
        agentQueryReady: false,
      }),
    ).toBe(false);
  });
});
