import { describe, expect, it } from "vitest";

import { getPostAuthRedirect, sanitizeRedirect } from "./auth-redirect";
import { HUB_COMMUNITY_PATH, getHubCommunityPath } from "./join-path";

describe("getPostAuthRedirect", () => {
  it("lands in Hub when no redirect is provided", () => {
    expect(getPostAuthRedirect(new URLSearchParams())).toBe(HUB_COMMUNITY_PATH);
    expect(getPostAuthRedirect(new URLSearchParams())).not.toBe("/");
  });

  it("lands in Hub when the only target is the marketing homepage", () => {
    expect(getPostAuthRedirect(new URLSearchParams("redirect=/"))).toBe(
      HUB_COMMUNITY_PATH,
    );
    expect(getPostAuthRedirect(new URLSearchParams("redirect=/en"))).toBe(
      HUB_COMMUNITY_PATH,
    );
    expect(getPostAuthRedirect(new URLSearchParams("callbackUrl=/nl"))).toBe(
      HUB_COMMUNITY_PATH,
    );
  });

  it("keeps an explicit community or gated target", () => {
    expect(
      getPostAuthRedirect(
        new URLSearchParams("redirect=/en/communities/rotterdam"),
      ),
    ).toBe("/en/communities/rotterdam");
    expect(
      getPostAuthRedirect(new URLSearchParams("callbackUrl=/en/claim/token-1")),
    ).toBe("/en/claim/token-1");
  });

  it("rejects open redirects and falls back to Hub", () => {
    expect(
      getPostAuthRedirect(new URLSearchParams("redirect=https://evil.com")),
    ).toBe(HUB_COMMUNITY_PATH);
    expect(sanitizeRedirect("//evil.com", getHubCommunityPath("en"))).toBe(
      "/en/communities/ait",
    );
  });
});
