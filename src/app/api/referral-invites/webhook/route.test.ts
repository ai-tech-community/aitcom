// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ verify: vi.fn(), suppress: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: mock.verify };
  },
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/referral-email/service", () => ({
  suppressReferralEmail: mock.suppress,
}));
import { POST } from "./route";
import { recipientHash } from "@/server/communities/referral-email/tokens";
const secret = "test-stable-referral-secret-at-least-32";
function request() {
  return new Request(
    "https://www.aitcommunity.org/api/referral-invites/webhook",
    {
      method: "POST",
      body: '{"raw":true}',
      headers: {
        "svix-id": "id",
        "svix-timestamp": "time",
        "svix-signature": "signature",
      },
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REFERRAL_INVITE_SECRET", secret);
  vi.stubEnv("REFERRAL_RESEND_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("RESEND_API_KEY", "test-no-network");
  mock.suppress.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("verified referral bounce and complaint webhook", () => {
  it("verifies the untouched body before accepting any recipient data", async () => {
    mock.verify.mockImplementation(() => {
      throw new Error("forged");
    });
    expect((await POST(request())).status).toBe(400);
    expect(mock.suppress).not.toHaveBeenCalled();
    expect(mock.verify).toHaveBeenCalledWith({
      payload: '{"raw":true}',
      headers: { id: "id", timestamp: "time", signature: "signature" },
      webhookSecret: "whsec_test",
    });
  });
  it.each([
    ["email.bounced", "bounce"],
    ["email.complained", "complaint"],
  ])("suppresses %s with keyed addresses only", async (type, reason) => {
    mock.verify.mockReturnValue({
      type,
      data: { to: ["friend@example.com", "friend@example.com", "broken"] },
    });
    expect((await POST(request())).status).toBe(200);
    expect(mock.suppress).toHaveBeenCalledExactlyOnceWith(
      {},
      recipientHash("friend@example.com", secret),
      reason,
    );
  });
  it("acknowledges unrelated events without changing preferences", async () => {
    mock.verify.mockReturnValue({
      type: "email.delivered",
      data: { to: ["friend@example.com"] },
    });
    expect((await POST(request())).status).toBe(200);
    expect(mock.suppress).not.toHaveBeenCalled();
  });
});
