import { describe, expect, it } from "vitest";
import { resolveBetterAuthBaseUrl, resolveTrustedOrigins } from "./base-url";

describe("resolveBetterAuthBaseUrl", () => {
  it("prefers explicit Better Auth URL settings", () => {
    expect(
      resolveBetterAuthBaseUrl({
        BETTER_AUTH_URL: "http://localhost:3002",
        BETTER_AUTH_BASE_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3001",
      }),
    ).toBe("http://localhost:3002");
  });

  it("falls back to the public app URL when auth-specific URLs are absent", () => {
    expect(
      resolveBetterAuthBaseUrl({
        NEXT_PUBLIC_APP_URL: "http://localhost:3002",
      }),
    ).toBe("http://localhost:3002");
  });

  it("uses the active dev port when provided", () => {
    expect(
      resolveBetterAuthBaseUrl({
        BETTER_AUTH_URL: "http://localhost:3000",
        NODE_ENV: "development",
        PORT: "3002",
      }),
    ).toBe("http://localhost:3002");
  });
});

describe("resolveTrustedOrigins", () => {
  it("includes the incoming request origin in development", () => {
    const request = new Request("http://localhost:3002/api/auth/signup/email", {
      headers: {
        origin: "http://localhost:3002",
        host: "localhost:3002",
      },
    });

    expect(
      resolveTrustedOrigins(
        {
          BETTER_AUTH_URL: "http://localhost:3000",
          NODE_ENV: "development",
          PORT: "3002",
        },
        request,
      ),
    ).toContain("http://localhost:3002");
  });
});
