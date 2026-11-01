// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), landing: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth/server", () => ({ getSession: mocks.session }));
vi.mock("@/server/communities/referral-email/landing", () => ({
  loadInviteLanding: mocks.landing,
}));
import { GET } from "./route";
import {
  createInviteSignupIntent,
  readInviteSignupIntent,
  SECURE_INVITE_SIGNUP_COOKIE,
} from "@/server/communities/referral-email/signup-attribution";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-at-least-32-characters");
  mocks.session.mockResolvedValue(null);
  mocks.landing.mockResolvedValue({ kind: "valid" });
});
afterEach(() => vi.unstubAllEnvs());
describe("guest invitation auth handoff", () => {
  it("stores signed context only in a secure HttpOnly cookie while retaining callback attribution", async () => {
    const response = await GET(
      new Request(
        "https://www.aitcommunity.org/api/referral-invites/start?code=personal&locale=fr&delivery=delivery-id&ref=personal&utm_medium=email&redirect=https://evil.test",
      ),
    );
    const auth = new URL(response.headers.get("location")!);
    expect(auth.pathname).toBe("/fr/auth/signup");
    const callback = new URL(auth.searchParams.get("redirect")!, auth.origin);
    expect(callback.pathname).toBe("/fr/invite/personal");
    expect(callback.searchParams.get("accept")).toBe("1");
    expect(callback.searchParams.get("delivery")).toBe("delivery-id");
    expect(callback.searchParams.get("utm_medium")).toBe("email");
    expect(callback.searchParams.has("signupIntent")).toBe(false);
    expect(callback.searchParams.has("redirect")).toBe(false);
    const cookie = response.cookies.get(SECURE_INVITE_SIGNUP_COOKIE)!;
    expect(readInviteSignupIntent(cookie.value, "personal")).not.toBeNull();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("preserves the original pre-signup time on an auth retry", async () => {
    const issuedAt = new Date(Date.now() - 60_000);
    const intent = createInviteSignupIntent("personal", issuedAt)!;
    const response = await GET(
      new Request(
        "https://www.aitcommunity.org/api/referral-invites/start?code=personal&mode=signin&locale=nl",
        { headers: { cookie: `${SECURE_INVITE_SIGNUP_COOKIE}=${intent}` } },
      ),
    );
    expect(response.cookies.get(SECURE_INVITE_SIGNUP_COOKIE)?.value).toBe(
      intent,
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/nl/auth/signin",
    );
  });
  it("never mints new signup proof for an existing signed-in member", async () => {
    mocks.session.mockResolvedValue({ user: { id: "member" } });
    const response = await GET(
      new Request(
        "https://www.aitcommunity.org/api/referral-invites/start?code=personal&locale=en",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://www.aitcommunity.org/en/invite/personal?accept=1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("returns unavailable grants to their explanation page without starting signup", async () => {
    mocks.landing.mockResolvedValue({ kind: "expired" });
    const response = await GET(
      new Request(
        "https://www.aitcommunity.org/api/referral-invites/start?code=personal&locale=en",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://www.aitcommunity.org/en/invite/personal",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
