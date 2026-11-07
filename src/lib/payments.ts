import { z } from "zod";

export const paymentProviderSchema = z.enum(["stripe", "adyen"]);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export const offerKindSchema = z.enum([
  "donation",
  "event",
  "course",
  "membership",
]);
export type OfferKind = z.infer<typeof offerKindSchema>;
export const billingIntervalSchema = z.enum(["once", "month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refund_pending"
  | "refunded";
export type SubscriptionStatus = "pending" | "active" | "past_due" | "canceled";

export const offerInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(""),
    kind: offerKindSchema,
    amount: z.number().int().min(100).max(1_000_000),
    currency: z.literal("EUR").default("EUR"),
    interval: billingIntervalSchema,
    resourceId: z.number().int().positive().nullable().default(null),
  })
  .superRefine((offer, ctx) => {
    if (
      (offer.kind === "event" || offer.kind === "course") !==
      (offer.resourceId !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resourceId"],
        message: "Select an event or course only for an individual purchase.",
      });
    }
    if (
      (offer.kind === "membership" && offer.interval === "once") ||
      ((offer.kind === "event" || offer.kind === "course") &&
        offer.interval !== "once")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["interval"],
        message:
          "Memberships recur; tickets and courses are one-off purchases.",
      });
    }
  });
export type OfferInput = z.infer<typeof offerInputSchema>;

/** Parse an entered EUR amount without floating-point rounding or extra decimals. */
export function parsePaymentAmount(value: string): number | null {
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole = "", fraction = ""] = value.trim().replace(",", ".").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return amount >= 100 && amount <= 1_000_000 ? amount : null;
}

export function formatPaymentAmount(
  amount: number,
  locale = "en",
  currency = "EUR",
) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    amount / 100,
  );
}

/** Calendar billing keeps the original anchor day, including after a short month. */
export function nextBillingDate(
  anchor: Date,
  interval: Exclude<BillingInterval, "once">,
  period = 1,
): Date {
  const month = anchor.getUTCMonth() + period * (interval === "year" ? 12 : 1);
  const result = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      month,
      1,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return result;
}

export function hasPaidAccess(
  subscription: {
    paidThrough: Date | null;
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
  },
  now: Date,
): boolean {
  if (
    !subscription.paidThrough ||
    subscription.status === "pending" ||
    subscription.status === "canceled"
  )
    return false;
  const grace =
    subscription.status === "past_due" && !subscription.cancelAtPeriodEnd
      ? 7 * 86400000
      : 0;
  return now.getTime() < subscription.paidThrough.getTime() + grace;
}

/** Payment failures must never roll a confirmed payment/refund backwards. */
export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === to) return false;
  const allowed: Record<PaymentStatus, readonly PaymentStatus[]> = {
    pending: ["paid", "failed", "expired"],
    failed: ["paid"], // delayed authoritative success
    expired: ["paid"],
    paid: ["refund_pending", "refunded"],
    refund_pending: ["paid", "refunded"],
    refunded: [],
  };
  return allowed[from].includes(to);
}

export interface ProviderSummary {
  provider: PaymentProvider;
  available: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountLabel: string | null;
  environment: "test" | "live";
}

export interface OfferSummary extends OfferInput {
  id: string;
  published: boolean;
  provider: PaymentProvider;
  editable: boolean;
}

export interface TransactionSummary {
  id: string;
  title: string;
  kind: OfferKind;
  amount: number;
  currency: string;
  buyerEmail: string;
  status: PaymentStatus;
  createdAt: Date;
  receiptUrl: string | null;
  fulfillment: "pending" | "fulfilled" | "refund_required" | "revoked";
  refundedAmount?: number;
}

export interface SubscriptionSummary {
  id: string;
  title: string;
  buyerEmail: string;
  provider: PaymentProvider;
  status: SubscriptionStatus;
  paidThrough: Date | null;
  cancelAtPeriodEnd: boolean;
  kind: OfferKind;
}

export interface PaymentsSnapshot {
  providers: ProviderSummary[];
  activeProvider: PaymentProvider | null;
  offers: OfferSummary[];
  transactions: TransactionSummary[];
  subscriptions: SubscriptionSummary[];
  resources: { id: number; kind: "event" | "course"; title: string }[];
  paidEntry: boolean;
  complimentaryMembers: { name: string | null; email: string }[];
}
