import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./access", () => ({ paymentsEnabled: () => true }));
vi.mock("./connections", () => ({
  refreshConnection: vi.fn(async (connection: object) => ({
    ...connection,
    chargesEnabled: true,
    balanceAccountId: "BA_1",
    storeId: "ST_1",
  })),
}));
vi.mock("./providers/adyen", () => ({
  adyenCheckout: vi.fn(),
  adyenRenew: vi
    .fn()
    .mockResolvedValue({ resultCode: "Authorised", pspReference: "auth_2" }),
}));
vi.mock("./commands", () => ({ runPaymentCommands: vi.fn() }));
vi.mock("./outbox", () => ({ drainPaymentOutbox: vi.fn() }));
import {
  recoverAdyenSubscription,
  runPaymentMaintenance,
} from "./billing-scheduler";
import { adyenCheckout, adyenRenew } from "./providers/adyen";
import { fakePaymentDatabase } from "./fixtures/database";

beforeEach(() => vi.clearAllMocks());
it("refuses a recovery checkout if cancellation wins before dispatch", async () => {
  const subscription = {
    id: "sub",
    userId: "buyer",
    orderId: "root",
    status: "past_due",
    sequence: 0,
    cancelAtPeriodEnd: false,
  };
  const fake = fakePaymentDatabase([
    [subscription],
    [subscription],
    [
      {
        id: "root",
        interval: "month",
        fulfillment: "fulfilled",
        checkoutLocale: "en",
      },
    ],
    [{ provider: "adyen" }],
    [
      {
        id: "attempt",
        status: "pending",
        providerReference: null,
        createdAt: new Date(),
      },
    ],
    [{ slug: "community" }],
    [{ ...subscription, cancelAtPeriodEnd: true }],
  ]);
  await expect(
    recoverAdyenSubscription(fake.db, "buyer", "sub", "en"),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(adyenCheckout).not.toHaveBeenCalled();
});
describe("durable billing maintenance", () => {
  it("advances past a payment awaiting capture so another community can renew", async () => {
    const now = new Date();
    const subscription = {
      id: "sub",
      orderId: "root",
      status: "active",
      cancelAtPeriodEnd: false,
      sequence: 0,
      token: "stored_1",
      communityId: "community",
    };
    const root = {
      id: "root",
      interval: "month",
      amount: 1500,
      fulfillment: "fulfilled",
    };
    const connection = { id: "connection", provider: "adyen" };
    const fake = fakePaymentDatabase([
      [{ id: "blocked" }, { id: "ready" }],
      [{ ...subscription, id: "blocked" }],
      [root],
      [connection],
      [
        {
          id: "attempt-1",
          status: "pending",
          providerReference: "awaiting-capture",
          createdAt: now,
        },
      ],
      [{ ...subscription, id: "ready" }],
      [root],
      [connection],
      [
        {
          id: "attempt-2",
          status: "pending",
          providerReference: null,
          createdAt: now,
        },
      ],
      [{ ...subscription, id: "ready" }],
      [
        {
          id: "attempt-2",
          status: "pending",
          providerReference: null,
          createdAt: now,
        },
      ],
      [],
    ]);
    const result = await runPaymentMaintenance(fake.db, now);
    expect(adyenRenew).toHaveBeenCalledWith(
      "BA_1",
      "ST_1",
      expect.objectContaining({
        id: "attempt-2",
        shopperReference: "root",
        amount: 1500,
      }),
    );
    expect(result.dispatched).toBe(1);
    expect(fake.remaining).toEqual([]);
  });
  it("expires a seat while retaining the subscription guard until provider closure", async () => {
    const fake = fakePaymentDatabase([[], []], [[{ id: "order-expired" }]]);
    await runPaymentMaintenance(fake.db);
    expect(fake.updates).toEqual(
      expect.arrayContaining([
        { table: "payment_order", values: { status: "expired" } },
        {
          table: "event_registration",
          values: { status: "payment_failed", paymentStatus: "expired" },
        },
        {
          table: "payment_subscription",
          values: { cancelAtPeriodEnd: true, nextBillAt: null },
        },
      ]),
    );
    expect(fake.inserts).toContainEqual({
      table: "payment_command",
      values: [
        {
          id: "expire-order-expired",
          orderId: "order-expired",
          kind: "expire_checkout",
        },
      ],
    });
  });
});
