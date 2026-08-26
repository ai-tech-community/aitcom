/** @vitest-environment node */

import { betterAuth } from "better-auth";
import { createEmailVerificationToken } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNextJsHandler } from "better-auth/next-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { HUB_COMMUNITY_PATH } from "@/lib/join-path";
import { PRODUCTION_COOKIE_DOMAIN } from "./base-url";

import {
  createSignInOnReplayedVerification,
  signInOnReplayedVerification,
} from "./sign-in-on-replayed-verify";

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

/**
 * Cookie header the way a browser builds it after a verify 302:
 * name=value only, Domain/Path/Secure/__Secure- honored, values decoded.
 * Isolated `auth.api.getSession({ cookie })` is not this walk.
 */
function browserCookieHeaderFromSetCookie(
  res: Response,
  requestUrl: string,
): string {
  const request = new URL(requestUrl);
  const lines =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];

  return lines
    .flatMap((line) => {
      const parts = line.split(";").map((part) => part.trim());
      const nv = parts[0];
      if (!nv) return [];
      const eq = nv.indexOf("=");
      if (eq < 0) return [];
      const name = nv.slice(0, eq);
      let value = nv.slice(eq + 1);
      try {
        value = decodeURIComponent(value);
      } catch {
        /* keep raw */
      }

      const attrs = new Map<string, string>();
      for (const part of parts.slice(1)) {
        const sep = part.indexOf("=");
        const key = (sep < 0 ? part : part.slice(0, sep)).toLowerCase();
        const val = sep < 0 ? "" : part.slice(sep + 1);
        attrs.set(key, val);
      }

      if (name.startsWith("__Secure-") && request.protocol !== "https:") {
        return [];
      }
      if (attrs.has("secure") && request.protocol !== "https:") {
        return [];
      }
      const domain = attrs.get("domain");
      if (domain) {
        const host = request.hostname;
        const allowed = domain.replace(/^\./, "").toLowerCase();
        if (host !== allowed && !host.endsWith(`.${allowed}`)) {
          return [];
        }
      }
      const path = attrs.get("path") ?? "/";
      if (!request.pathname.startsWith(path)) {
        return [];
      }
      return [`${name}=${value}`];
    })
    .join("; ");
}

async function sessionFromHubGetSession(
  GET: (request: Request) => Promise<Response>,
  res: Response,
) {
  const cookie = browserCookieHeaderFromSetCookie(
    res,
    `${ORIGIN}/api/auth/get-session`,
  );
  expect(cookie).toMatch(/(?:__Secure-)?better-auth\.session_token=/);

  const sessionRes = await GET(
    new Request(`${ORIGIN}/api/auth/get-session`, {
      headers: {
        cookie,
        origin: ORIGIN,
        referer: `${ORIGIN}/en${HUB_COMMUNITY_PATH}`,
      },
    }),
  );
  expect(sessionRes.status).toBe(200);
  const body: unknown = await sessionRes.json();
  expect(body).toBeTruthy();
  expect(body).toMatchObject({
    user: { id: expect.any(String) },
  });
  return body as { user: { id: string } };
}

function redirectLocation(res: Response): string {
  return res.headers.get("location") ?? "";
}

function sessionCookieLine(res: Response): string | undefined {
  return (
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : []
  ).find((cookie) => cookie.includes("session_token"));
}

type CreateVerifyAuthOptions = {
  onMail?: (url: string) => void;
  enroll?: (session: { userId: string }) => Promise<void>;
  productionCookieDomain?: boolean;
};

async function createVerifyAuth(options: CreateVerifyAuthOptions = {}) {
  const store = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };

  const sessionCreates: Array<{ userId: string }> = [];
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
        options.onMail?.(url);
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session: { userId: string }) => {
            sessionCreates.push({ userId: session.userId });
          },
        },
      },
    },
    hooks: {
      after: options.enroll
        ? createSignInOnReplayedVerification({ enroll: options.enroll })
        : signInOnReplayedVerification,
    },
    trustedOrigins: [ORIGIN],
    ...(options.productionCookieDomain
      ? {
          advanced: {
            crossSubDomainCookies: {
              enabled: true,
              domain: PRODUCTION_COOKIE_DOMAIN,
            },
          },
        }
      : {}),
  });

  return { auth, store, sessionCreates };
}

async function signUpAndCaptureVerifyUrl(
  options: Omit<CreateVerifyAuthOptions, "onMail"> = {},
) {
  let mailedUrl = "";
  const created = await createVerifyAuth({
    ...options,
    onMail: (url) => {
      mailedUrl = url;
    },
  });

  await created.auth.api.signUpEmail({
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
  return { ...created, mailedUrl };
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
    const prefetchSession = await sessionFromHubGetSession(GET, prefetch);

    const human = await GET(new Request(mailedUrl));
    expect(human.status).toBeGreaterThanOrEqual(300);
    expect(human.status).toBeLessThan(400);
    expect(redirectLocation(human)).toBe(HUB_COMMUNITY_PATH);
    expect(redirectLocation(human)).not.toMatch(/[?&]error=/);
    expect(hasSessionCookie(human)).toBe(true);
    const humanSession = await sessionFromHubGetSession(GET, human);
    expect(humanSession.user.id).toBe(prefetchSession.user.id);
  });

  it("emits the same production cookie Hub getSession already reads", async () => {
    const enroll = vi.fn(async () => undefined);
    const { auth, mailedUrl, sessionCreates } = await signUpAndCaptureVerifyUrl(
      {
        enroll,
        productionCookieDomain: true,
      },
    );
    const { GET } = toNextJsHandler(auth.handler);

    const prefetch = await GET(new Request(mailedUrl));
    const prefetchCookie = sessionCookieLine(prefetch);
    expect(prefetchCookie).toContain(`Domain=${PRODUCTION_COOKIE_DOMAIN}`);
    expect(prefetchCookie).toMatch(/^__Secure-better-auth\.session_token=/);
    enroll.mockClear();

    const human = await GET(new Request(mailedUrl));
    const humanCookie = sessionCookieLine(human);
    expect(humanCookie).toContain(`Domain=${PRODUCTION_COOKIE_DOMAIN}`);
    expect(humanCookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(humanCookie).toContain("Path=/");
    expect(humanCookie).toContain("HttpOnly");
    expect(humanCookie).toContain("Secure");
    expect(humanCookie).toContain("SameSite=Lax");

    const fromResponse = await sessionFromHubGetSession(GET, human);
    expect(sessionCreates.length).toBeGreaterThanOrEqual(2);
    expect(enroll).toHaveBeenCalledWith({
      userId: fromResponse.user.id,
    });

    const prefetchSession = await sessionFromHubGetSession(GET, prefetch);
    expect(prefetchSession.user.id).toBe(fromResponse.user.id);
  });

  it("does not mint a session for an invalid token", async () => {
    const enroll = vi.fn(async () => undefined);
    const { auth } = await createVerifyAuth({ enroll });
    const { GET } = toNextJsHandler(auth.handler);
    const url = `${ORIGIN}/api/auth/verify-email?token=not-a-jwt&callbackURL=${encodeURIComponent(HUB_COMMUNITY_PATH)}`;

    const res = await GET(new Request(url));
    expect(hasSessionCookie(res)).toBe(false);
    expect(redirectLocation(res)).toMatch(/error=invalid_token/);
    expect(enroll).not.toHaveBeenCalled();
    const cookie = browserCookieHeaderFromSetCookie(
      res,
      `${ORIGIN}/api/auth/get-session`,
    );
    expect(cookie).not.toMatch(/(?:__Secure-)?better-auth\.session_token=/);
  });

  it("does not mint a session for an expired token", async () => {
    const enroll = vi.fn(async () => undefined);
    const { auth } = await createVerifyAuth({ enroll });
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
    expect(enroll).not.toHaveBeenCalled();
  });

  it("does not mint a session for a change-email token", async () => {
    const enroll = vi.fn(async () => undefined);
    const { auth, mailedUrl } = await signUpAndCaptureVerifyUrl({ enroll });
    const { GET } = toNextJsHandler(auth.handler);
    await GET(new Request(mailedUrl));
    enroll.mockClear();

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
    expect(enroll).not.toHaveBeenCalled();
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
    expect(src).toContain("createSignInOnReplayedVerification");
    expect(src).toContain("enroll: enrollOnSessionCreated");
    expect(src).toContain("autoSignInAfterVerification: true");
  });

  it("rebuilds the 302 after setSessionCookie like first-verify", () => {
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "sign-in-on-replayed-verify.ts",
      ),
      "utf8",
    );
    const mint = src.slice(src.indexOf("setSessionCookie"), src.length);
    expect(mint).toContain("throw ctx.redirect(location)");
  });
});
