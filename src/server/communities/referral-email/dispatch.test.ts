// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  deliverClaimedReferral,
  retryReferralDelivery,
  dispatchReferralEmails,
  queueReferralReminders,
} from "./dispatch";
import type { referralEmailInvites } from "@/server/db/schema";

const now = new Date("2026-11-01T10:00:00Z");
const row: typeof referralEmailInvites.$inferSelect = {
  id: "id",
  batchId: "batch",
  senderId: "sender",
  communityId: "community",
  inviteCode: "code",
  recipientHash: "hash",
  recipientEmail: "friend@example.com",
  senderName: "Maya",
  communityName: "AIT",
  locale: "en",
  status: "sending",
  phase: "invite",
  attempts: 1,
  firstAttemptAt: now,
  nextAttemptAt: now,
  leaseUntil: now,
  sentAt: null,
  remindedAt: null,
  joinedAt: null,
  joinedUserId: null,
  createdAt: now,
};
describe("durable referral delivery", () => {
  it("does no database or provider work while disabled, including reminders", async () => {
    vi.stubEnv("REFERRAL_INVITES_ENABLED", "false");
    const db = { transaction: vi.fn(), update: vi.fn() };
    expect(await dispatchReferralEmails(db as never)).toBe(0);
    expect(await queueReferralReminders(db as never)).toBe(0);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("never contacts a suppressed, joined, banned or otherwise ineligible recipient", async () => {
    const deps = {
      eligible: vi.fn().mockResolvedValue(false),
      send: vi.fn(),
      finish: vi.fn(),
    };
    await deliverClaimedReferral(row, deps, now);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith("suppressed");
  });
  it("records sent only after acceptance", async () => {
    const deps = {
      eligible: vi.fn().mockResolvedValue(true),
      send: vi.fn().mockResolvedValue("provider-id"),
      finish: vi.fn(),
    };
    await deliverClaimedReferral(row, deps, now);
    expect(deps.finish).toHaveBeenCalledExactlyOnceWith("sent");
  });
  it("retries temporary failures but stops before provider idempotency expires", async () => {
    const deps = {
      eligible: vi.fn().mockResolvedValue(true),
      send: vi.fn().mockRejectedValue(new Error("timeout")),
      finish: vi.fn(),
    };
    await deliverClaimedReferral(row, deps, now);
    expect(deps.finish).toHaveBeenLastCalledWith("retry");
    await deliverClaimedReferral({ ...row, attempts: 6 }, deps, now);
    expect(deps.finish).toHaveBeenLastCalledWith("failed");
    expect(
      retryReferralDelivery(1, new Date(now.getTime() - 23 * 3_600_000), now),
    ).toBe(false);
  });
  it("leaves a storage failure recoverable rather than reporting a provider failure", async () => {
    const deps = {
      eligible: vi.fn().mockResolvedValue(true),
      send: vi.fn().mockResolvedValue("id"),
      finish: vi.fn().mockRejectedValue(new Error("store unavailable")),
    };
    await expect(deliverClaimedReferral(row, deps, now)).rejects.toThrow(
      "store unavailable",
    );
    expect(deps.finish).toHaveBeenCalledExactlyOnceWith("sent");
  });
});
