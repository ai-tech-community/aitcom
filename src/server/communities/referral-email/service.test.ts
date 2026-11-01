// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { queueReferralBatch, type ReferralContext } from "./service";
import {
  referralEmailInvites,
  referralInviteBatches,
  referralInviteBudgets,
} from "@/server/db/schema";

afterEach(() => vi.unstubAllEnvs());
const context = {
  sender: {
    id: "sender",
    name: "Maya",
    email: "maya@example.com",
    emailVerified: true,
  },
  community: { id: "community", name: "AIT", slug: "ait" },
  referralsEnabled: true,
} as ReferralContext;
const input = {
  requestId: "d76b670f-e48c-4b47-a3ef-d809dff69096",
  emails: ["friend@example.com"],
  locale: "en" as const,
};
function enable() {
  vi.stubEnv("REFERRAL_INVITES_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv(
    "REFERRAL_INVITE_SECRET",
    "stable-test-referral-secret-at-least-32",
  );
  vi.stubEnv("REFERRAL_RESEND_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("RESEND_API_KEY", "test-no-network");
}
/** Recording database boundary, never a real database. Terminal reads consume
 * fixture results; writes record intent so quota/duplicate paths are observable.
 */
function recordingDb(reads: unknown[][], replay?: unknown) {
  const writes: {
    table: unknown;
    values: Record<string, unknown> | Record<string, unknown>[];
  }[] = [];
  const updates: unknown[] = [];
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        innerJoin: () => chain,
        limit: async () => reads.shift() ?? [],
        for: async () => reads.shift() ?? [],
      };
      return chain;
    }),
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        writes.push({ table, values });
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () =>
            table === referralInviteBatches ? (replay ? [] : [values]) : [],
        };
        return chain;
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (value: unknown) => {
        updates.push({ table, value });
        return { where: async () => undefined };
      },
    })),
  };
  return {
    db: {
      transaction: async (task: (tx: unknown) => Promise<unknown>) => task(tx),
    },
    tx,
    writes,
    updates,
  };
}
describe("referral batching boundary", () => {
  it("refuses launch-disabled requests before any database mutation", async () => {
    vi.stubEnv("REFERRAL_INVITES_ENABLED", "false");
    const db = { transaction: vi.fn() };
    await expect(
      queueReferralBatch(db as never, context, input),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("requires verified email and enabled community referrals", async () => {
    enable();
    const db = { transaction: vi.fn() };
    await expect(
      queueReferralBatch(
        db as never,
        { ...context, sender: { ...context.sender, emailVerified: false } },
        input,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      queueReferralBatch(
        db as never,
        { ...context, referralsEnabled: false },
        input,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("normalizes duplicate recipients and stores one delivery", async () => {
    enable();
    const fake = recordingDb([
      [{ code: "safe-personal-code" }],
      [{ used: 0 }],
      [],
      [],
      [],
    ]);
    await queueReferralBatch(fake.db as never, context, {
      ...input,
      emails: [" FRIEND@example.com ", "friend@example.com"],
    });
    const outbox = fake.writes.find(
      (write) => write.table === referralEmailInvites,
    )!;
    expect(outbox.values).toHaveLength(1);
    expect((outbox.values as Record<string, unknown>[])[0]).toMatchObject({
      recipientEmail: "friend@example.com",
      senderId: "sender",
      inviteCode: "safe-personal-code",
    });
  });
  it("does not create deliveries when an atomic daily budget would exceed fifty", async () => {
    enable();
    const fake = recordingDb([
      [{ code: "safe" }],
      [{ used: 49 }],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    await expect(
      queueReferralBatch(fake.db as never, context, {
        ...input,
        emails: ["first@example.com", "second@example.com"],
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(
      fake.writes.some((write) => write.table === referralEmailInvites),
    ).toBe(false);
    expect(
      fake.updates.some(
        (update) =>
          (update as { table: unknown }).table === referralInviteBudgets,
      ),
    ).toBe(false);
  });
  it("does not expose or enqueue globally suppressed addresses", async () => {
    enable();
    const fake = recordingDb([
      [{ code: "safe" }],
      [{ used: 0 }],
      [{ recipientHash: "suppressed" }],
    ]);
    const result = await queueReferralBatch(fake.db as never, context, input);
    expect(result.skipped).toBe(1);
    expect(
      fake.writes.some((write) => write.table === referralEmailInvites),
    ).toBe(false);
    expect(result).not.toHaveProperty("reason");
    expect(result).not.toHaveProperty("recipientHash");
  });
  it("replays an existing request without consuming another budget or delivery", async () => {
    enable();
    const first = recordingDb([[{ code: "safe" }], [{ used: 0 }], [], [], []]);
    const result = await queueReferralBatch(first.db as never, context, input);
    const previous = {
      ...(first.writes.find((write) => write.table === referralInviteBatches)!
        .values as object),
      id: result.batchId,
      skipped: 0,
    };
    const replay = recordingDb([[{ code: "safe" }], [previous]], previous);
    expect(
      await queueReferralBatch(replay.db as never, context, input),
    ).toEqual(result);
    expect(
      replay.writes.some(
        (write) =>
          write.table === referralInviteBudgets ||
          write.table === referralEmailInvites,
      ),
    ).toBe(false);
    const changed = recordingDb([[{ code: "safe" }], [previous]], previous);
    await expect(
      queueReferralBatch(changed.db as never, context, {
        ...input,
        emails: ["other@example.com"],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
