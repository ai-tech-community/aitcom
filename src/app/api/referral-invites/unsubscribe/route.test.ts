// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ suppress: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/referral-email/service", () => ({
  suppressReferralEmail: mock.suppress,
}));
import * as route from "./route";
import { referralOptOutToken } from "@/server/communities/referral-email/tokens";
const secret = "test-stable-referral-secret-at-least-32";
const hash = "a".repeat(64);
const token = referralOptOutToken(hash, secret);
function post(body: string, t = token) {
  return new Request(
    `https://www.aitcommunity.org/api/referral-invites/unsubscribe?t=${t}`,
    { method: "POST", body },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REFERRAL_INVITE_SECRET", secret);
  mock.suppress.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("account-free invitation unsubscribe", () => {
  it("requires an explicit confirmed or one-click POST, never GET", async () => {
    expect("GET" in route).toBe(false);
    expect((await route.POST(post(""))).status).toBe(400);
    expect(mock.suppress).not.toHaveBeenCalled();
  });
  it("accepts a valid one-click POST without a session and survives replay", async () => {
    expect((await route.POST(post("List-Unsubscribe=One-Click"))).status).toBe(
      200,
    );
    expect((await route.POST(post("List-Unsubscribe=One-Click"))).status).toBe(
      200,
    );
    expect(mock.suppress).toHaveBeenCalledWith({}, hash, "unsubscribe");
  });
  it("rejects malformed signatures before storage", async () => {
    expect(
      (await route.POST(post("confirm=unsubscribe", "forged"))).status,
    ).toBe(400);
    expect(mock.suppress).not.toHaveBeenCalled();
  });
  it("redirects an explicit French confirmation to its done page", async () => {
    const response = await route.POST(post("confirm=unsubscribe&locale=fr"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.aitcommunity.org/fr/invitations/unsubscribe?done=1",
    );
  });
  it("fails closed when no signing secret exists", async () => {
    vi.stubEnv("REFERRAL_INVITE_SECRET", "");
    expect((await route.POST(post("confirm=unsubscribe"))).status).toBe(503);
    expect(mock.suppress).not.toHaveBeenCalled();
  });
});
