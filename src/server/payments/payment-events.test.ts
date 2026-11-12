import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("@/server/communities/activate-membership", () => ({
  writeActiveRow: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/server/communities/referral-email/privacy", () => ({
  scrubJoinedReferralEmails: vi.fn(),
}));
vi.mock("@/lib/gamification", () => ({
  awardXp: vi.fn(),
  XP_AMOUNTS: { REGISTER_EVENT: 25 },
}));
import {
  applyPaymentEvent,
  type ConfirmedPaymentEvent,
} from "./payment-events";
import { type paymentOrders } from "@/server/db/schema";

const order = {
  id: "order",
  communityId: "community",
  connectionId: "connection",
  amount: 1000,
  currency: "EUR",
  kind: "donation",
  status: "pending",
  fulfillment: "pending",
  interval: "once",
  buyerId: null,
} as typeof paymentOrders.$inferSelect;
const event: ConfirmedPaymentEvent = {
  eventId: "stripe:evt_1",
  connectionId: "connection",
  orderId: "order",
  reference: "pi_1",
  amount: 1000,
  currency: "EUR",
  status: "paid",
};

function fakeDatabase(rows: unknown[][], eventInserted = true) {
  const updates: { table: string; values: unknown }[] = [];
  const inserts: string[] = [];
  const chain = (result: unknown[]) => {
    const value = {
      from: () => value,
      where: () => value,
      limit: () => value,
      for: () => value,
      returning: () => value,
      onConflictDoNothing: () => value,
      onConflictDoUpdate: () => value,
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return value;
  };
  const db = {
    select: vi.fn(() => chain(rows.shift() ?? [])),
    insert: vi.fn((table) => ({
      values: () => {
        inserts.push(getTableName(table));
        return chain(eventInserted ? [{ id: event.eventId }] : []);
      },
    })),
    update: vi.fn((table) => ({
      set: (values: unknown) => {
        updates.push({ table: getTableName(table), values });
        return chain([]);
      },
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(db),
    ),
  };
  return { db: db as never, updates, inserts, transaction: db.transaction };
}

describe("confirmed payment projection", () => {
  it("does not reactivate a recurring checkout after cancellation or expiry", async () => {
    const recurring = {
      ...order,
      interval: "month",
      status: "expired",
      kind: "membership",
    };
    const fake = fakeDatabase([
      [recurring],
      [recurring],
      [{ id: "sub", cancelAtPeriodEnd: true }],
    ]);
    await applyPaymentEvent(fake.db, {
      ...event,
      subscriptionReference: "stripe-sub",
    });
    expect(fake.updates).toContainEqual({
      table: "payment_order",
      values: { fulfillment: "refund_required" },
    });
    expect(
      fake.updates.some(
        (row) =>
          row.table === "payment_subscription" &&
          (row.values as { status?: string }).status === "active",
      ),
    ).toBe(false);
    expect(fake.inserts).toContain("payment_command");
  });
  it("checks the provider amount before starting a projection transaction", async () => {
    const fake = fakeDatabase([[order]]);
    await expect(
      applyPaymentEvent(fake.db, { ...event, amount: 1 }),
    ).rejects.toThrow("Payment scope or amount");
    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.updates).toEqual([]);
  });
  it("does not repeat fulfillment for an already processed provider event", async () => {
    const fake = fakeDatabase([[order]], false);
    await applyPaymentEvent(fake.db, event);
    expect(fake.updates).toEqual([]);
  });
  it("fulfills donations without creating membership or course access", async () => {
    const fake = fakeDatabase([[order], [order]]);
    await applyPaymentEvent(fake.db, event);
    expect(fake.updates).toEqual([
      {
        table: "payment_order",
        values: expect.objectContaining({
          status: "paid",
          providerReference: "pi_1",
        }),
      },
      { table: "payment_order", values: { fulfillment: "fulfilled" } },
    ]);
    expect(fake.inserts).toEqual(["payment_event"]);
  });
  it("ignores a delayed failure after a confirmed payment", async () => {
    const fake = fakeDatabase([
      [{ ...order, status: "paid" }],
      [{ ...order, status: "paid" }],
    ]);
    await applyPaymentEvent(fake.db, { ...event, status: "failed" });
    expect(fake.updates).toEqual([]);
  });
});
