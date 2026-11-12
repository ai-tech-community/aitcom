import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./payment-events", () => ({ applyPaymentEvent: vi.fn() }));
vi.mock("./management", () => ({ projectConfirmedRefund: vi.fn() }));
vi.mock("./providers/adyen", () => ({
  adyenCapture: vi.fn().mockResolvedValue({ pspReference: "capture-request" }),
  adyenCancelAuthorization: vi.fn(),
}));
import { processAdyenEvents } from "./adyen-events";
import { adyenCapture } from "./providers/adyen";
import { applyPaymentEvent } from "./payment-events";
import { fakePaymentDatabase } from "./fixtures/database";

const secret = "ab".repeat(32),
  id = "10000000-0000-4000-8000-000000000001";
function notification(
  eventCode: string,
  reference: string,
  originalReference = "",
) {
  const item = {
    pspReference: reference,
    originalReference,
    merchantAccountCode: "AIT",
    merchantReference: id,
    amount: { value: 1500, currency: "EUR" },
    eventCode,
    success: "true",
  };
  const signed = [
    reference,
    originalReference,
    "AIT",
    id,
    "1500",
    "EUR",
    eventCode,
    "true",
  ].join(":");
  return {
    notificationItems: [
      {
        NotificationRequestItem: {
          ...item,
          additionalData: {
            hmacSignature: createHmac("sha256", Buffer.from(secret, "hex"))
              .update(signed)
              .digest("base64"),
          },
        },
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADYEN_MERCHANT_ACCOUNT", "AIT");
});
afterEach(() => vi.unstubAllEnvs());
describe("Adyen capture lifecycle", () => {
  it("requests capture after authorization but grants no access yet", async () => {
    const fake = fakePaymentDatabase([
      [
        {
          id,
          connectionId: "connection",
          status: "pending",
          amount: 1500,
          currency: "EUR",
          captureReference: null,
          reservationUntil: new Date(Date.now() + 60000),
        },
      ],
      [{ id: "connection", balanceAccountId: "BA_seller", provider: "adyen" }],
    ]);
    await processAdyenEvents(
      fake.db,
      notification("AUTHORISATION", "auth_1"),
      secret,
    );
    expect(adyenCapture).toHaveBeenCalledWith("BA_seller", "auth_1", 1500, id);
    expect(applyPaymentEvent).not.toHaveBeenCalled();
    expect(fake.updates).toContainEqual({
      table: "payment_order",
      values: { captureReference: "capture-request" },
    });
  });
  it("fulfills only after a matching signed capture confirmation", async () => {
    const fake = fakePaymentDatabase([
      [
        {
          id,
          connectionId: "connection",
          status: "pending",
          amount: 1500,
          currency: "EUR",
          providerReference: "auth_1",
        },
      ],
      [{ id: "connection", balanceAccountId: "BA_seller", provider: "adyen" }],
    ]);
    await processAdyenEvents(
      fake.db,
      notification("CAPTURE", "capture_1", "auth_1"),
      secret,
    );
    expect(applyPaymentEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: id,
        connectionId: "connection",
        reference: "auth_1",
        amount: 1500,
        status: "paid",
      }),
    );
  });
  it("does not dispatch another capture when authorization is retried", async () => {
    const fake = fakePaymentDatabase([
      [
        {
          id,
          connectionId: "connection",
          status: "pending",
          amount: 1500,
          currency: "EUR",
          captureReference: "capture-existing",
          reservationUntil: new Date(Date.now() + 60000),
        },
      ],
      [{ id: "connection", balanceAccountId: "BA_seller", provider: "adyen" }],
    ]);
    await processAdyenEvents(
      fake.db,
      notification("AUTHORISATION", "auth_1"),
      secret,
    );
    expect(adyenCapture).not.toHaveBeenCalled();
  });
});
