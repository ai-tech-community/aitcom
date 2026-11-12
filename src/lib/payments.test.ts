import { describe, expect, it } from "vitest";
import {
  canTransitionPayment,
  hasPaidAccess,
  nextBillingDate,
  offerInputSchema,
  parsePaymentAmount,
} from "./payments";

describe("payment rules", () => {
  it("parses local amounts without rounding extra decimals", () => {
    expect(parsePaymentAmount("12,99")).toBe(1299);
    expect(parsePaymentAmount(" 10.5 ")).toBe(1050);
    for (const value of [
      "0",
      "0.99",
      "1.001",
      "-1",
      "1e3",
      "Infinity",
      "10001",
      "1,234.56",
    ])
      expect(parsePaymentAmount(value)).toBeNull();
  });
  it("validates what an offer sells and its billing interval", () => {
    const offer = {
      title: "Learn",
      kind: "course",
      amount: 2000,
      interval: "once",
      resourceId: 1,
    };
    expect(offerInputSchema.safeParse(offer).success).toBe(true);
    expect(
      offerInputSchema.safeParse({ ...offer, interval: "month" }).success,
    ).toBe(false);
    expect(
      offerInputSchema.safeParse({ ...offer, resourceId: null }).success,
    ).toBe(false);
    expect(
      offerInputSchema.safeParse({
        ...offer,
        kind: "membership",
        resourceId: null,
        interval: "year",
      }).success,
    ).toBe(true);
  });
  it("keeps calendar anchors over short months and leap years", () => {
    const anchor = new Date("2028-01-31T10:30:00Z");
    expect(nextBillingDate(anchor, "month").toISOString()).toBe(
      "2028-02-29T10:30:00.000Z",
    );
    expect(nextBillingDate(anchor, "month", 2).toISOString()).toBe(
      "2028-03-31T10:30:00.000Z",
    );
    expect(
      nextBillingDate(new Date("2028-02-29T10:30:00Z"), "year").toISOString(),
    ).toBe("2029-02-28T10:30:00.000Z");
  });
  it("applies grace only to failed renewals and never to cancellations", () => {
    const subscription = {
      paidThrough: new Date("2026-12-01T00:00:00Z"),
      status: "past_due" as const,
      cancelAtPeriodEnd: false,
    };
    expect(hasPaidAccess(subscription, new Date("2026-12-07T23:59:59Z"))).toBe(
      true,
    );
    expect(hasPaidAccess(subscription, new Date("2026-12-08T00:00:00Z"))).toBe(
      false,
    );
    expect(
      hasPaidAccess(
        { ...subscription, cancelAtPeriodEnd: true },
        new Date("2026-12-01T00:00:00Z"),
      ),
    ).toBe(false);
    expect(
      hasPaidAccess(
        { ...subscription, status: "canceled" },
        new Date("2026-11-30T00:00:00Z"),
      ),
    ).toBe(false);
  });
  it("does not regress paid or refunded orders on delayed failures", () => {
    expect(canTransitionPayment("paid", "failed")).toBe(false);
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
    expect(canTransitionPayment("failed", "paid")).toBe(true);
    expect(canTransitionPayment("paid", "refunded")).toBe(true);
  });
});
