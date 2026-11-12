import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAdyenSignature, verifyStripeSignature } from "./signatures";

describe("provider webhook signatures", () => {
  it("requires a recent signature of the exact Stripe body", () => {
    const raw = '{"id":"evt_1"}',
      secret = "whsec_test",
      now = 1730000000000;
    const signature = createHmac("sha256", secret)
      .update(`${now / 1000}.${raw}`)
      .digest("hex");
    const header = `t=${now / 1000},v1=bad,v1=${signature}`;
    expect(verifyStripeSignature(raw, header, secret, now)).toBe(true);
    expect(verifyStripeSignature(raw + " ", header, secret, now)).toBe(false);
    expect(verifyStripeSignature(raw, header, secret, now + 301000)).toBe(
      false,
    );
    expect(verifyStripeSignature(raw, "t=no,v1=bad", secret, now)).toBe(false);
  });
  it("uses the Adyen escaped field order and rejects tampered amount/merchant", () => {
    const secret = "ab".repeat(32);
    const item = {
      pspReference: "psp:1",
      merchantAccountCode: "AIT",
      merchantReference: "order",
      amount: { value: 1200, currency: "EUR" },
      eventCode: "AUTHORISATION",
      success: "true",
    };
    const hmacSignature = createHmac("sha256", Buffer.from(secret, "hex"))
      .update("psp\\:1::AIT:order:1200:EUR:AUTHORISATION:true")
      .digest("base64");
    const signed = { ...item, additionalData: { hmacSignature } };
    expect(verifyAdyenSignature(signed, secret)).toBe(true);
    expect(
      verifyAdyenSignature({ ...signed, merchantAccountCode: "other" }, secret),
    ).toBe(false);
    expect(
      verifyAdyenSignature(
        { ...signed, amount: { value: 1, currency: "EUR" } },
        secret,
      ),
    ).toBe(false);
  });
});
