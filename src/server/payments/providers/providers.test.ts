import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeCheckout } from "./stripe";
import { adyenCheckout, adyenRenew } from "./adyen";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const order = {
  id: "order-1",
  title: "Membership",
  amount: 1500,
  currency: "EUR",
  interval: "month" as const,
  buyerEmail: "member@example.com",
  buyerId: "member-1",
  returnUrl: "https://example.com/return",
};

describe("payment provider requests", () => {
  it("creates a Stripe subscription on the owner's account with a stable key and no AIT fee", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        id: "cs_test_1",
        url: "https://checkout.stripe.com/example",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await stripeCheckout("acct_owner", order);
    const [url, request] = fetcher.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(request.headers).toMatchObject({
      "Stripe-Account": "acct_owner",
      "Idempotency-Key": "checkout-order-1",
    });
    const body = request.body as URLSearchParams;
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("1500");
    expect(body.get("subscription_data[metadata][orderId]")).toBe("order-1");
    expect(body.toString()).not.toContain("application_fee");
  });
  it("routes Adyen proceeds and processing fees to the seller and includes seller store context", async () => {
    vi.stubEnv("ADYEN_API_KEY", "test_key");
    vi.stubEnv("ADYEN_MERCHANT_ACCOUNT", "AIT");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: "link-1", url: "https://test.adyen.link/example" }),
      );
    vi.stubGlobal("fetch", fetcher);
    await adyenCheckout("BA_seller", "ST_seller", order);
    const request = fetcher.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.store).toBe("ST_seller");
    expect(body.manualCapture).toBe(true);
    expect(body.shopperReference).toBe("order-1");
    expect(body.recurringProcessingModel).toBe("Subscription");
    expect(body.splits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: "BA_seller",
          type: "BalanceAccount",
          amount: { currency: "EUR", value: 1500 },
        }),
        expect.objectContaining({ account: "BA_seller", type: "PaymentFee" }),
      ]),
    );
    expect(
      body.splits.some(
        (split: { type: string }) => split.type === "Commission",
      ),
    ).toBe(false);
  });
  it("keeps the same Adyen charge identity on retries", async () => {
    vi.stubEnv("ADYEN_API_KEY", "test_key");
    vi.stubEnv("ADYEN_MERCHANT_ACCOUNT", "AIT");
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ resultCode: "Authorised", pspReference: "psp_1" }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const payment = {
      id: "period-1",
      amount: 1500,
      token: "stored_1",
      shopperReference: "order-1",
    };
    await adyenRenew("BA_seller", "ST_seller", payment);
    await adyenRenew("BA_seller", "ST_seller", payment);
    expect(fetcher.mock.calls[0]![1].headers["Idempotency-Key"]).toBe(
      "period-1",
    );
    expect(fetcher.mock.calls[1]![1].headers["Idempotency-Key"]).toBe(
      "period-1",
    );
  });
  it("does not leak provider response bodies to application errors", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private provider/customer data", { status: 403 }),
        ),
    );
    await expect(stripeCheckout("acct_owner", order)).rejects.toThrow(
      "Payment provider request failed (403).",
    );
  });
});
