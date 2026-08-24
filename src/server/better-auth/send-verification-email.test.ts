import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetResend } = vi.hoisted(() => ({
  mockGetResend: vi.fn(),
}));

vi.mock("@/server/email", () => ({
  getResend: mockGetResend,
}));

import {
  isEmailVerificationRequired,
  sendVerificationEmail,
} from "./send-verification-email";

const VERIFY_URL =
  "https://www.aitcommunity.org/api/auth/verify-email?token=qa-token";

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    mockGetResend.mockReset();
  });

  it("sends a verification message through the existing Resend mailer", async () => {
    const send = vi.fn().mockResolvedValue({ id: "email_qa" });
    mockGetResend.mockReturnValue({ emails: { send } });

    const sent = await sendVerificationEmail({
      user: { email: "greg+qa-human@klevox.com", name: "Soren Ravn" },
      url: VERIFY_URL,
    });

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      from: "AIT Community <noreply@mailer.aitcommunity.org>",
      to: "greg+qa-human@klevox.com",
      subject: "Verify your email — AIT Community",
      html: expect.stringContaining(VERIFY_URL),
    });
    expect(send.mock.calls[0]?.[0].html).toContain("Soren Ravn");
  });

  it("mails a production verify URL instead of a preview host", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const send = vi.fn().mockResolvedValue({ id: "email_qa" });
    mockGetResend.mockReturnValue({ emails: { send } });

    const sent = await sendVerificationEmail({
      user: { email: "greg+qa-human@klevox.com", name: "Soren Ravn" },
      url: "https://aitcom-git-preview-klevox.vercel.app/api/auth/verify-email?token=qa-token&callbackURL=%2F",
    });

    expect(sent).toBe(true);
    const html = send.mock.calls[0]?.[0].html as string;
    expect(html).toContain(
      "https://www.aitcommunity.org/api/auth/verify-email?token=qa-token",
    );
    expect(html).toContain("callbackURL=%2Fcommunities%2Fait");
    expect(html).not.toContain("vercel.app");
    vi.unstubAllEnvs();
  });

  it("does not pretend to send when Resend is unset", async () => {
    mockGetResend.mockReturnValue(null);

    const sent = await sendVerificationEmail({
      user: { email: "greg+qa-fuse@klevox.com", name: "Soren Ravn" },
      url: VERIFY_URL,
    });

    expect(sent).toBe(false);
  });

  it("lets a new email signup sign in when no mail can be sent", () => {
    expect(isEmailVerificationRequired(undefined)).toBe(false);
    expect(isEmailVerificationRequired("")).toBe(false);
    expect(isEmailVerificationRequired("re_test")).toBe(true);
  });
});

describe("Better Auth verification wiring", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "config.ts"),
    "utf8",
  );

  it("registers sendVerificationEmail under emailVerification, not emailAndPassword", () => {
    expect(src).toContain('from "./send-verification-email"');
    expect(src).toContain("sendOnSignUp: true");
    expect(src).toContain("sendOnSignIn: true");
    expect(src).toContain(
      "requireEmailVerification: isEmailVerificationRequired(env.RESEND_API_KEY)",
    );

    const emailAndPassword = src.slice(
      src.indexOf("emailAndPassword:"),
      src.indexOf("emailVerification:"),
    );
    expect(emailAndPassword).not.toContain("sendVerificationEmail");

    const emailVerification = src.slice(src.indexOf("emailVerification:"));
    expect(emailVerification).toContain("sendVerificationEmail");
    expect(emailVerification).toContain("autoSignInAfterVerification: true");
  });

  it("keeps the verify session cookie on production hosts", () => {
    expect(src).toContain("nextCookies()");
    expect(src).toContain("crossSubDomainCookies");
    expect(src).toContain("resolveSessionCookieDomain");
    expect(src).toContain("autoSignInAfterVerification: true");
  });
});

describe("verify email URL and session cookie names", () => {
  it("rewrites the mailed verify URL through canonicalizeVerificationUrl", () => {
    const sendSrc = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "send-verification-email.ts",
      ),
      "utf8",
    );
    expect(sendSrc).toContain("canonicalizeVerificationUrl");
  });

  it("reads both Better Auth session cookie names after verify", () => {
    const middlewareSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../middleware.ts"),
      "utf8",
    );
    expect(middlewareSrc).toContain("better-auth.session_token");
    expect(middlewareSrc).toContain("__Secure-better-auth.session_token");
  });
});
