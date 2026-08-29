import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  canonicalizeVerificationUrl,
  getApexToWwwRedirectUrl,
  pinVerifyRedirectLocation,
  resolveBetterAuthBaseUrl,
  resolveSessionCookieDomain,
  resolveTrustedOrigins,
  sanitizeVerifyCallbackUrl,
} from "./base-url";
import { HUB_COMMUNITY_PATH } from "@/lib/join-path";

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

  it("pins production auth to the app origin and ignores a preview BETTER_AUTH_URL", () => {
    expect(
      resolveBetterAuthBaseUrl({
        BETTER_AUTH_URL:
          "https://aitcom-git-cursor-join-lands-in-community-6db9-klevox.vercel.app",
        NEXT_PUBLIC_APP_URL: "https://www.aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        VERCEL_URL:
          "aitcom-git-cursor-join-lands-in-community-6db9-klevox.vercel.app",
      }),
    ).toBe(CANONICAL_PRODUCTION_ORIGIN);
  });

  it("pins Vercel production to www even when BETTER_AUTH_URL is apex", () => {
    expect(
      resolveBetterAuthBaseUrl({
        BETTER_AUTH_URL: "https://aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe(CANONICAL_PRODUCTION_ORIGIN);
    expect(
      resolveBetterAuthBaseUrl({
        BETTER_AUTH_URL: "https://www.aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe(CANONICAL_PRODUCTION_ORIGIN);
  });

  it("does not use a Vercel preview host as the production fallback", () => {
    expect(
      resolveBetterAuthBaseUrl({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        VERCEL_URL: "aitcom-abc123-klevox.vercel.app",
      }),
    ).toBe(CANONICAL_PRODUCTION_ORIGIN);
  });

  it("lets preview deployments keep their own auth origin", () => {
    const preview = "https://aitcom-git-fix-verify-klevox.vercel.app";
    expect(
      resolveBetterAuthBaseUrl({
        BETTER_AUTH_URL: preview,
        NEXT_PUBLIC_APP_URL: "https://www.aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_URL: "aitcom-git-fix-verify-klevox.vercel.app",
      }),
    ).toBe(preview);
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

  it("trusts this Vercel preview host plus production app origins", () => {
    const previewHost =
      "aitcom-git-cursor-join-lands-in-community-6db9-klevox.vercel.app";
    const origins = resolveTrustedOrigins({
      BETTER_AUTH_URL: "https://www.aitcommunity.org",
      NEXT_PUBLIC_APP_URL: "https://www.aitcommunity.org",
      NODE_ENV: "production",
      VERCEL_URL: previewHost,
      VERCEL_BRANCH_URL: previewHost,
    });

    expect(origins).toContain(`https://${previewHost}`);
    expect(origins).toContain("https://www.aitcommunity.org");
    expect(origins).toContain("https://aitcommunity.org");
  });

  it("does not trust an arbitrary request origin in production", () => {
    const request = new Request("https://evil.example/api/auth/sign-in/email", {
      headers: {
        origin: "https://evil.example",
        host: "evil.example",
      },
    });

    const origins = resolveTrustedOrigins(
      {
        BETTER_AUTH_URL: "https://www.aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_URL: "aitcom-abc123-klevox.vercel.app",
      },
      request,
    );

    expect(origins).toContain("https://aitcom-abc123-klevox.vercel.app");
    expect(origins).not.toContain("https://evil.example");
  });
});

describe("resolveSessionCookieDomain", () => {
  it("shares the session cookie across www and apex on production", () => {
    expect(
      resolveSessionCookieDomain({
        BETTER_AUTH_URL: "https://www.aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe("aitcommunity.org");
    expect(
      resolveSessionCookieDomain({
        BETTER_AUTH_URL: "https://aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe("aitcommunity.org");
  });

  it("does not set a cookie Domain on preview or localhost", () => {
    expect(
      resolveSessionCookieDomain({
        BETTER_AUTH_URL: "https://aitcom-git-fix-verify-klevox.vercel.app",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBeUndefined();
    expect(
      resolveSessionCookieDomain({
        BETTER_AUTH_URL: "http://localhost:3000",
        NODE_ENV: "development",
      }),
    ).toBeUndefined();
  });

  it("does not inherit the production cookie Domain on a preview that uses the app URL", () => {
    expect(
      resolveSessionCookieDomain({
        NEXT_PUBLIC_APP_URL: "https://www.aitcommunity.org",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_URL: "aitcom-git-fix-verify-klevox.vercel.app",
      }),
    ).toBeUndefined();
  });
});

describe("canonicalizeVerificationUrl", () => {
  it("rewrites a preview verify link to production and keeps the Hub callback", () => {
    const previewVerify =
      "https://aitcom-git-cursor-join-lands-in-community-6db9-klevox.vercel.app/api/auth/verify-email?token=qa-token&callbackURL=%2Fen%2Fcommunities%2Fait";

    const canonical = canonicalizeVerificationUrl(previewVerify, {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });
    const parsed = new URL(canonical);

    expect(parsed.origin).toBe(CANONICAL_PRODUCTION_ORIGIN);
    expect(parsed.pathname).toBe("/api/auth/verify-email");
    expect(parsed.searchParams.get("token")).toBe("qa-token");
    expect(parsed.searchParams.get("callbackURL")).toBe("/en/communities/ait");
  });

  it("does not rewrite a preview verify link on a preview deploy", () => {
    const previewVerify =
      "https://aitcom-git-fix-verify-klevox.vercel.app/api/auth/verify-email?token=qa-token&callbackURL=%2Fen%2Fcommunities%2Fait";

    expect(
      canonicalizeVerificationUrl(previewVerify, {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(previewVerify);
  });

  it("remaps a homepage or preview callbackURL so verify does not wipe the landing", () => {
    expect(sanitizeVerifyCallbackUrl("/")).toBe(HUB_COMMUNITY_PATH);
    expect(sanitizeVerifyCallbackUrl("/en")).toBe(HUB_COMMUNITY_PATH);
    expect(
      sanitizeVerifyCallbackUrl(
        "https://aitcom-abc123-klevox.vercel.app/en/communities/ait",
      ),
    ).toBe("/en/communities/ait");
    expect(sanitizeVerifyCallbackUrl("https://evil.example/phish")).toBe(
      HUB_COMMUNITY_PATH,
    );
    expect(sanitizeVerifyCallbackUrl("https://www.aitcommunity.org/")).toBe(
      HUB_COMMUNITY_PATH,
    );
  });

  it("rewrites an apex verify link to www on production", () => {
    const apexVerify =
      "https://aitcommunity.org/api/auth/verify-email?token=qa-token&callbackURL=%2Fcommunities%2Fait";
    const canonical = canonicalizeVerificationUrl(apexVerify, {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    });
    const parsed = new URL(canonical);
    expect(parsed.origin).toBe(CANONICAL_PRODUCTION_ORIGIN);
    expect(parsed.pathname).toBe("/api/auth/verify-email");
    expect(parsed.searchParams.get("callbackURL")).toBe(HUB_COMMUNITY_PATH);
  });
});

describe("pinVerifyRedirectLocation", () => {
  it("emits an absolute www Hub URL after a www verify so Vercel cannot send Hub to apex", () => {
    expect(
      pinVerifyRedirectLocation(
        HUB_COMMUNITY_PATH,
        "https://www.aitcommunity.org/api/auth/verify-email?token=qa",
      ),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}${HUB_COMMUNITY_PATH}`);
    expect(
      pinVerifyRedirectLocation(
        "https://aitcommunity.org/communities/ait",
        "https://www.aitcommunity.org/api/auth/verify-email?token=qa",
      ),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}${HUB_COMMUNITY_PATH}`);
    expect(
      pinVerifyRedirectLocation(
        "/en/communities/ait",
        "https://www.aitcommunity.org/api/auth/verify-email?token=qa",
      ),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}/en/communities/ait`);
  });

  it("keeps a preview verify on the preview host", () => {
    expect(
      pinVerifyRedirectLocation(
        HUB_COMMUNITY_PATH,
        "https://aitcom-git-fix-verify-klevox.vercel.app/api/auth/verify-email?token=qa",
      ),
    ).toBe(HUB_COMMUNITY_PATH);
  });
});

describe("getApexToWwwRedirectUrl", () => {
  it("sends an apex Hub document to www and leaves www alone", () => {
    expect(
      getApexToWwwRedirectUrl("https://aitcommunity.org/en/communities/ait"),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}/en/communities/ait`);
    expect(
      getApexToWwwRedirectUrl("https://aitcommunity.org/communities/ait"),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}${HUB_COMMUNITY_PATH}`);
    expect(
      getApexToWwwRedirectUrl(
        "https://www.aitcommunity.org/en/communities/ait",
      ),
    ).toBeNull();
  });
});
