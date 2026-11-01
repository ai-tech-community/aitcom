// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mock.send };
  },
}));
import {
  renderReferralEmail,
  sendReferralEmail,
  type ReferralMessage,
} from "./mail";
import { referralSendingEnabled, referralPhaseEnabled } from "./config";
const enabled = {
  REFERRAL_INVITES_ENABLED: "true",
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  REFERRAL_INVITE_SECRET: "stable-test-secret-at-least-32-characters",
  REFERRAL_RESEND_WEBHOOK_SECRET: "whsec_test",
  RESEND_API_KEY: "test-no-network",
};
const message: ReferralMessage = {
  id: "delivery-id",
  recipientEmail: "friend@example.com",
  recipientHash: "a".repeat(64),
  senderName: "Maya <script>",
  communityName: "Community & friends",
  inviteCode: "opaque-code",
  locale: "en",
  phase: "invite",
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });
});
describe("referral email launch gate and payload", () => {
  it("refuses a direct reminder send while its separate switch is off", async () => {
    expect(
      await sendReferralEmail({ ...message, phase: "reminder" }, enabled),
    ).toBeNull();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("requires the reminder flag again at delivery time", () => {
    expect(referralPhaseEnabled("invite", enabled)).toBe(true);
    expect(referralPhaseEnabled("reminder", enabled)).toBe(false);
    expect(
      referralPhaseEnabled("reminder", {
        ...enabled,
        REFERRAL_INVITE_REMINDERS_ENABLED: "true",
      }),
    ).toBe(true);
    expect(
      referralPhaseEnabled("reminder", {
        ...enabled,
        REFERRAL_INVITE_REMINDERS_ENABLED: "false",
      }),
    ).toBe(false);
  });
  it.each([
    {},
    { ...enabled, REFERRAL_INVITES_ENABLED: undefined },
    { ...enabled, VERCEL_ENV: "preview" },
    { ...enabled, NODE_ENV: "test" },
    { ...enabled, REFERRAL_INVITE_SECRET: "short" },
    { ...enabled, REFERRAL_RESEND_WEBHOOK_SECRET: "" },
    { ...enabled, RESEND_API_KEY: "" },
  ])("fails closed without every launch requirement", async (env) => {
    expect(referralSendingEnabled(env)).toBe(false);
    expect(await sendReferralEmail(message, env)).toBeNull();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("sends one recipient with stable provider idempotency and an account-free unsubscribe", async () => {
    expect(await sendReferralEmail(message, enabled)).toBe("provider-id");
    const [payload, options] = mock.send.mock.calls[0]!;
    expect(payload.to).toBe("friend@example.com");
    expect(payload.bcc).toBeUndefined();
    expect(options.idempotencyKey).toBe("referral/delivery-id/invite");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(payload.headers["List-Unsubscribe"]).toContain(
      "/api/referral-invites/unsubscribe?t=",
    );
    expect(payload.html).toContain("Maya &lt;script&gt;");
    expect(payload.html).not.toContain("Maya <script>");
    expect(payload.text).toContain("delivery=delivery-id");
    expect(payload.text).toContain("ref=opaque-code");
  });
  it.each(["en", "nl", "fr"] as const)(
    "renders %s and gives reminders a separate idempotency scope",
    async (locale) => {
      const email = renderReferralEmail(
        { ...message, locale },
        enabled.REFERRAL_INVITE_SECRET,
      );
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.text).toContain(`/${locale}/invite/`);
      await sendReferralEmail(
        { ...message, locale, phase: "reminder" },
        { ...enabled, REFERRAL_INVITE_REMINDERS_ENABLED: "true" },
      );
      expect(mock.send.mock.calls[0]![1].idempotencyKey).toBe(
        "referral/delivery-id/reminder",
      );
    },
  );
  it("does not claim success when the provider rejects a request", async () => {
    mock.send.mockResolvedValue({ error: { message: "rejected" }, data: null });
    await expect(sendReferralEmail(message, enabled)).rejects.toThrow(
      "not accepted",
    );
  });
});
