import { afterEach, expect, it, vi } from "vitest";
vi.mock("./providers/stripe", () => ({
  stripeCancel: vi.fn(),
  stripeRequest: vi.fn(),
  stripeSessionSchema: {},
}));
vi.mock("./providers/adyen", () => ({ adyenExpireCheckout: vi.fn() }));
import { runPaymentCommands } from "./commands";
import { stripeRequest } from "./providers/stripe";
import { fakePaymentDatabase } from "./fixtures/database";

afterEach(() => vi.restoreAllMocks());
it("retains cancellation intent when a pending checkout has no subscription reference", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const command = {
    id: "cancel-1",
    kind: "cancel_subscription",
    orderId: "order",
    completedAt: null,
  };
  const fake = fakePaymentDatabase([
    [command],
    [command],
    [{ id: "order", status: "pending", connectionId: "conn" }],
    [{ provider: "stripe", accountId: "acct" }],
    [{ id: "sub", status: "pending", providerReference: null }],
  ]);
  await runPaymentCommands(fake.db);
  expect(fake.updates.some((row) => row.values.completedAt)).toBe(false);
});
it("retains the uniqueness guard for a completed Stripe checkout awaiting payment reconciliation", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(stripeRequest).mockResolvedValue({ status: "complete" });
  const command = {
    id: "expire-1",
    kind: "expire_checkout",
    orderId: "order",
    completedAt: null,
  };
  const fake = fakePaymentDatabase([
    [command],
    [command],
    [
      {
        id: "order",
        status: "expired",
        connectionId: "conn",
        checkoutReference: "cs_1",
      },
    ],
    [{ provider: "stripe", accountId: "acct" }],
  ]);
  await runPaymentCommands(fake.db);
  expect(fake.updates.some((row) => row.table === "payment_subscription")).toBe(
    false,
  );
  expect(fake.updates.some((row) => row.values.completedAt)).toBe(false);
});
it("releases the pending subscription only after Stripe confirms checkout closure", async () => {
  vi.mocked(stripeRequest).mockResolvedValue({ status: "expired" });
  const command = {
    id: "expire-1",
    kind: "expire_checkout",
    orderId: "order",
    completedAt: null,
  };
  const fake = fakePaymentDatabase([
    [command],
    [command],
    [
      {
        id: "order",
        status: "expired",
        connectionId: "conn",
        checkoutReference: "cs_1",
      },
    ],
    [{ provider: "stripe", accountId: "acct" }],
  ]);
  await runPaymentCommands(fake.db);
  expect(fake.updates).toContainEqual({
    table: "payment_subscription",
    values: { status: "canceled", cancelAtPeriodEnd: true, nextBillAt: null },
  });
  expect(
    fake.updates.some((row) => row.values.completedAt instanceof Date),
  ).toBe(true);
});
