// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { JOIN_HREF } from "./components/site-nav";

// These tests cover our redirects before next-intl handles the request.
vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response(null),
}));

import middleware from "./middleware";

describe("guest Join entry", () => {
  it.each([
    ["en", "better-auth.session_token"],
    ["nl", "__Secure-better-auth.session_token"],
    ["fr", "better-auth.session_token"],
  ])(
    "opens %s signup rather than the Hub when an old cookie remains",
    (locale, cookie) => {
      const request = new NextRequest(
        `https://www.aitcommunity.org/${locale}${JOIN_HREF}`,
        {
          headers: { cookie: `${cookie}=expired-session` },
        },
      );
      const response = middleware(request);
      const destination = new URL(
        response.headers.get("location") ?? request.url,
      );
      expect(destination.pathname).toBe(`/${locale}/auth/signup`);
    },
  );
});

describe("French route middleware", () => {
  it("protects a French dashboard and keeps the sign-in redirect in French", () => {
    const response = middleware(
      new NextRequest("https://www.aitcommunity.org/fr/dashboard"),
    );
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/fr/auth/signin");
    expect(destination.searchParams.get("redirect")).toBe("/fr/dashboard");
  });

  it("uses French for guessed signup URLs", () => {
    const response = middleware(
      new NextRequest("https://www.aitcommunity.org/fr/signup?code=invite"),
    );
    expect(response.headers.get("location")).toBe(
      "https://www.aitcommunity.org/fr/auth/signup?code=invite",
    );
  });

  it("redirects a signed-in member's French join door to the Hub", () => {
    const request = new NextRequest("https://www.aitcommunity.org/fr/join", {
      headers: { cookie: "better-auth.session_token=fixture" },
    });
    expect(middleware(request).headers.get("location")).toBe(
      "https://www.aitcommunity.org/fr/communities/ait",
    );
  });
});
