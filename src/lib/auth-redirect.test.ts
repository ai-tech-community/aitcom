import { describe, expect, it } from "vitest";

import {
  POST_AUTH_LANDING_PATH,
  getPostAuthLandingPath,
  getPostAuthRedirect,
  sanitizeRedirect,
} from "./auth-redirect";
import { HUB_COMMUNITY_PATH } from "./join-path";

describe("post-auth landing", () => {
  it("is the Explore communities page, not one community", () => {
    expect(POST_AUTH_LANDING_PATH).toBe("/communities");
    expect(POST_AUTH_LANDING_PATH).not.toBe(HUB_COMMUNITY_PATH);
    expect(getPostAuthLandingPath()).toBe("/communities");
    expect(getPostAuthLandingPath("en")).toBe("/en/communities");
    expect(getPostAuthLandingPath("nl")).toBe("/nl/communities");
  });
});

describe("getPostAuthRedirect", () => {
  it("lands on Explore communities when no redirect is provided", () => {
    expect(getPostAuthRedirect(new URLSearchParams())).toBe(
      POST_AUTH_LANDING_PATH,
    );
    expect(getPostAuthRedirect(new URLSearchParams())).not.toBe("/");
  });

  it("lands on Explore communities when the only target is the marketing homepage", () => {
    expect(getPostAuthRedirect(new URLSearchParams("redirect=/"))).toBe(
      POST_AUTH_LANDING_PATH,
    );
    expect(getPostAuthRedirect(new URLSearchParams("redirect=/en"))).toBe(
      POST_AUTH_LANDING_PATH,
    );
    expect(getPostAuthRedirect(new URLSearchParams("callbackUrl=/nl"))).toBe(
      POST_AUTH_LANDING_PATH,
    );
  });

  it("keeps an explicit community or gated target", () => {
    expect(
      getPostAuthRedirect(
        new URLSearchParams("redirect=/en/communities/rotterdam"),
      ),
    ).toBe("/en/communities/rotterdam");
    expect(
      getPostAuthRedirect(new URLSearchParams("redirect=/en/communities/ait")),
    ).toBe("/en/communities/ait");
    expect(
      getPostAuthRedirect(new URLSearchParams("callbackUrl=/en/claim/token-1")),
    ).toBe("/en/claim/token-1");
  });

  it("rejects open redirects and falls back to the landing", () => {
    expect(
      getPostAuthRedirect(new URLSearchParams("redirect=https://evil.com")),
    ).toBe(POST_AUTH_LANDING_PATH);
    expect(sanitizeRedirect("//evil.com", getPostAuthLandingPath("en"))).toBe(
      "/en/communities",
    );
  });
});
