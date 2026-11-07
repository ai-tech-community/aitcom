import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectConfirmedRefund,
  stopCommunityMembershipBilling,
} from "./management";
import { fakePaymentDatabase } from "./fixtures/database";
afterEach(() => vi.unstubAllEnvs());

it("stops membership renewals durably before admission is removed", async () => {
  vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "true");
  const fake = fakePaymentDatabase([
    [{ subscription: { id: "subscription", orderId: "original-order" } }],
  ]);
  await stopCommunityMembershipBilling(fake.db, "community", "member");
  expect(fake.updates).toContainEqual({
    table: "payment_subscription",
    values: { cancelAtPeriodEnd: true, nextBillAt: null },
  });
  expect(fake.inserts).toContainEqual({
    table: "payment_command",
    values: {
      id: "cancel-subscription",
      orderId: "original-order",
      kind: "cancel_subscription",
    },
  });
});

describe("confirmed membership refunds", () => {
  it("queues provider cancellation when a renewal period is refunded externally", async () => {
    const through = new Date("2026-12-01");
    const fake = fakePaymentDatabase([
      [
        {
          id: "renewal",
          renewalOf: "root",
          amount: 1500,
          kind: "membership",
          paidPeriodEnd: through,
        },
      ],
      [{ total: 1500 }],
      [{ id: "subscription", paidThrough: through }],
    ]);
    await projectConfirmedRefund(fake.db, "renewal");
    expect(fake.inserts).toContainEqual({
      table: "payment_command",
      values: {
        id: "cancel-subscription",
        orderId: "root",
        kind: "cancel_subscription",
      },
    });
    expect(fake.updates).toContainEqual({
      table: "payment_subscription",
      values: expect.objectContaining({
        status: "canceled",
        paidThrough: null,
        cancelAtPeriodEnd: true,
      }),
    });
  });
  it("does not erase a later paid period when refunding a historical payment", async () => {
    const fake = fakePaymentDatabase([
      [
        {
          id: "old-payment",
          renewalOf: "root",
          amount: 1500,
          kind: "membership",
          paidPeriodEnd: new Date("2026-11-01"),
        },
      ],
      [{ total: 1500 }],
      [{ id: "subscription", paidThrough: new Date("2026-12-01") }],
    ]);
    await projectConfirmedRefund(fake.db, "old-payment");
    expect(
      fake.updates.filter((update) => update.table === "payment_subscription"),
    ).toEqual([]);
    expect(fake.inserts).toEqual([]);
  });
});
