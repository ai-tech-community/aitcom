/** @vitest-environment node */

import { betterAuth } from "better-auth";
import { createEmailVerificationToken } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNextJsHandler } from "better-auth/next-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HUB_COMMUNITY_PATH } from "@/lib/join-path";

import { signInOnReplayedVerification } from "./sign-in-on-replayed-verify";

const SECRET = "test-secret-for-verify-replay-at-least-32-chars";
const ORIGIN = "https://www.aitcommunity.org";

function sessionCookieHeader(res: Response): string {
  const cookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const raw = res.headers.get("set-cookie") ?? "";
  return [...cookies, raw].join("\n");
}

function hasSessionCookie(res: Response): boolean {
  return /(?:^|[\n,])\s*(?:__Secure-)?better-auth\.session_token=/.test(
    sessionCookieHeader(res),
  );
}

function redirectLocation(res: Response): string {
  return res.headers.get("location") ?? "";
}

async function createVerifyAuth(onMail?: (url: string) => void) {
  const store = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };

  const auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: memoryAdapter(store),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ url }: { url: string }) => {
        onMail?.(url);
      },
    },
    hooks: {
      after: signInOnReplayedVerification,
    },
    trustedOrigins: [ORIGIN],
  });

  return { auth, store };
}

async function signUpAndCaptureVerifyUrl() {
  let mailedUrl = "";
  const { auth } = await createVerifyAuth((url) => {
    mailedUrl = url;
  });

  await auth.api.signUpEmail({
    body: {
      email: "soren.prefetch.verify@example.com",
      password: "a-secure-password-123",
      name: "Soren Ravn",
      callbackURL: HUB_COMMUNITY_PATH,
    },
  });

  expect(mailedUrl).toContain("/api/auth/verify-email");
  const parsed = new URL(mailedUrl);
  expect(parsed.origin).toBe(ORIGIN);
  expect(parsed.pathname).toBe("/api/auth/verify-email");
  expect(parsed.searchParams.get("token")).toBeTruthy();
  expect(parsed.searchParams.get("callbackURL")).toBe(HUB_COMMUNITY_PATH);
  return { auth, mailedUrl };
}

describe("verify-email prefetch then human click", () => {
  it("signs in on the second GET of an already-used token and lands in Hub", async () => {
    const { auth, mailedUrl } = await signUpAndCaptureVerifyUrl();
    const { GET } = toNextJsHandler(auth.handler);

    const prefetch = await GET(new Request(mailedUrl));
    expect(prefetch.status).toBeGreaterThanOrEqual(300);
    expect(prefetch.status).toBeLessThan(400);
    expect(redirectLocation(prefetch)).toBe(HUB_COMMUNITY_PATH);
    expect(hasSessionCookie(prefetch)).toBe(true);

    const human = await GET(new Request(mailedUrl));
    expect(human.status).toBeGreaterThanOrEqual(300);
    expect(human.status).toBeLessThan(400);
    expect(redirectLocation(human)).toBe(HUB_COMMUNITY_PATH);
    expect(redirectLocation(human)).not.toMatch(/[?&]error=/);
    expect(hasSessionCookie(human)).toBe(true);
  });

  it("does not mint a session for an invalid token", async () => {
    const { auth } = await createVerifyAuth();
    const { GET } = toNextJsHandler(auth.handler);
    const url = `${ORIGIN}/api/auth/verify-email?token=not-a-jwt&callbackURL=${encodeURIComponent(HUB_COMMUNITY_PATH)}`;

    const res = await GET(new Request(url));
    expect(hasSessionCookie(res)).toBe(false);
    expect(redirectLocation(res)).toMatch(/error=invalid_token/);
  });

  it("does not mint a session for an expired token", async () => {
    const { auth } = await createVerifyAuth();
    const token = await createEmailVerificationToken(
      SECRET,
      "soren.prefetch.verify@example.com",
      undefined,
      0,
    );
    const { GET } = toNextJsHandler(auth.handler);
    const url = `${ORIGIN}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(HUB_COMMUNITY_PATH)}`;

    const res = await GET(new Request(url));
    expect(hasSessionCookie(res)).toBe(false);
    expect(redirectLocation(res)).toMatch(/error=token_expired/);
  });

  it("does not mint a session for a change-email token", async () => {
    const { auth, mailedUrl } = await signUpAndCaptureVerifyUrl();
    const { GET } = toNextJsHandler(auth.handler);
    await GET(new Request(mailedUrl));

    const token = await createEmailVerificationToken(
      SECRET,
      "soren.prefetch.verify@example.com",
      "soren.new@example.com",
      3600,
      { requestType: "change-email-confirmation" },
    );
    const url = `${ORIGIN}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(HUB_COMMUNITY_PATH)}`;

    const res = await GET(new Request(url));
    expect(hasSessionCookie(res)).toBe(false);
    expect(redirectLocation(res)).not.toMatch(/[?&]error=/);
    expect(redirectLocation(res)).toBe(HUB_COMMUNITY_PATH);
  });
});

describe("Better Auth already-verified leftover", () => {
  it("still skips setSessionCookie when the address is already verified", () => {
    const verifySrc = readFileSync(
      join(
        process.cwd(),
        "node_modules/better-auth/dist/api/routes/email-verification.mjs",
      ),
      "utf8",
    );
    const alreadyVerified = verifySrc.slice(
      verifySrc.indexOf("if (user.user.emailVerified)"),
      verifySrc.indexOf(
        "if (ctx.context.options.emailVerification?.beforeEmailVerification)",
      ),
    );
    expect(alreadyVerified).toContain(
      "throw ctx.redirect(ctx.query.callbackURL)",
    );
    expect(alreadyVerified).not.toContain("setSessionCookie");
    expect(alreadyVerified).not.toContain("createSession");
  });

  it("wires the replay hook in the production Better Auth config", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "config.ts"),
      "utf8",
    );
    expect(src).toContain('from "./sign-in-on-replayed-verify"');
    expect(src).toContain("signInOnReplayedVerification");
    expect(src).toContain("autoSignInAfterVerification: true");
  });
});
