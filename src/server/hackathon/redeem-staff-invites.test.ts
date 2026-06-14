import { describe, it, expect } from "vitest";
import { redeemPendingStaffInvites } from "./redeem-staff-invites";

// Minimal fake db capturing inserts/updates and serving queued select results.
function makeFakeDb(selectQueue: unknown[][]) {
  const calls = { inserts: [] as unknown[], membershipInserts: 0, updates: 0 };
  const db = {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy"])
        chain[m] = () => chain;
      chain.limit = () => chain;
      chain.then = (r: (v: unknown[]) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(r);
      return chain;
    },
    insert: () => {
      const chain: Record<string, unknown> = {};
      chain.values = (v: unknown) => {
        (chain as { _v: unknown })._v = v;
        return chain;
      };
      chain.onConflictDoNothing = () => {
        calls.membershipInserts++;
        return Promise.resolve();
      };
      chain.onConflictDoUpdate = () => {
        calls.inserts.push((chain as { _v: unknown })._v);
        return Promise.resolve();
      };
      chain.then = (r: (v: unknown) => unknown) =>
        Promise.resolve(undefined).then(r);
      return chain;
    },
    update: () => {
      const chain: Record<string, unknown> = {};
      chain.set = () => chain;
      chain.where = () => {
        calls.updates++;
        return Promise.resolve();
      };
      return chain;
    },
  };
  return { db, calls };
}

describe("redeemPendingStaffInvites", () => {
  const now = new Date("2026-06-14T00:00:00.000Z");

  it("grants + marks each redeemable invite; hub-wide makes no membership", async () => {
    const { db, calls } = makeFakeDb([
      [
        {
          id: "inv1",
          challengeId: 1,
          communityId: null,
          challengeTitle: "Hack",
          role: "judge",
          invitedBy: "u-host",
          revokedAt: null,
          redeemedAt: null,
          expiresAt: null,
        },
      ],
    ]);

    await redeemPendingStaffInvites(db as never, {
      userId: "new-1",
      email: "new@example.com",
      now,
    });

    expect(calls.inserts).toHaveLength(1); // staff grant
    expect(calls.membershipInserts).toBe(0); // hub-wide → no membership
    expect(calls.updates).toBe(1); // invite marked redeemed
  });

  it("community invite also creates a membership", async () => {
    const { db, calls } = makeFakeDb([
      [
        {
          id: "inv2",
          challengeId: 2,
          communityId: "comm-9",
          challengeTitle: "CHack",
          role: "organizer",
          invitedBy: "u-host",
          revokedAt: null,
          redeemedAt: null,
          expiresAt: null,
        },
      ],
    ]);

    await redeemPendingStaffInvites(db as never, {
      userId: "new-2",
      email: "c@example.com",
      now,
    });

    expect(calls.membershipInserts).toBe(1);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toBe(1);
  });

  it("skips expired/revoked invites (filtered before any write)", async () => {
    const { db, calls } = makeFakeDb([
      [
        {
          id: "inv3",
          challengeId: 3,
          communityId: null,
          challengeTitle: "Old",
          role: "judge",
          invitedBy: "u-host",
          revokedAt: null,
          redeemedAt: null,
          expiresAt: new Date("2026-06-01T00:00:00.000Z"), // past
        },
      ],
    ]);

    await redeemPendingStaffInvites(db as never, {
      userId: "new-3",
      email: "x@example.com",
      now,
    });

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toBe(0);
  });
});
