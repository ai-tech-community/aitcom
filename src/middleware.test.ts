// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// These tests cover our redirects before next-intl handles the request.
vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response(null),
}));

import middleware from "./middleware";

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
