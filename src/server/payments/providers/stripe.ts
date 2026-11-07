import { z } from "zod";
import { providerRequest, requiredPaymentEnv } from "./http";
import type { BillingInterval } from "@/lib/payments";

const reference = z
  .union([z.string(), z.object({ id: z.string() })])
  .nullable()
  .optional();
export const stripeSessionSchema = z.object({
  id: z.string(),
  url: z.string().url().nullable().optional(),
  payment_status: z.string().optional(),
  status: z.string().optional(),
  client_reference_id: z.string().nullable().optional(),
  amount_total: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  payment_intent: reference,
  subscription: reference,
  customer: reference,
  metadata: z.record(z.string(), z.string()).nullable().optional(),
});
export const stripeSubscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  customer: reference,
  cancel_at_period_end: z.boolean(),
  metadata: z.record(z.string(), z.string()),
  items: z.object({
    data: z.array(z.object({ current_period_end: z.number().optional() })),
  }),
  current_period_end: z.number().optional(),
});

export function stripeRequest<T>(
  path: string,
  accountId: string | null,
  schema: z.ZodType<T>,
  body?: URLSearchParams,
  idempotencyKey?: string,
) {
  return providerRequest(
    `https://api.stripe.com/v1/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${requiredPaymentEnv("STRIPE_SECRET_KEY")}`,
        "Stripe-Version": "2026-10-28.endive",
        ...(accountId ? { "Stripe-Account": accountId } : {}),
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body ? { body } : {}),
    },
    schema,
  );
}

export function stripeConfigured() {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_CONNECT_CLIENT_ID &&
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

export function stripeConnectUrl(state: string, redirectUrl: string) {
  const params = new URLSearchParams({
    response_type: "code",
    scope: "read_write",
    client_id: requiredPaymentEnv("STRIPE_CONNECT_CLIENT_ID"),
    state,
    redirect_uri: redirectUrl,
  });
  return `https://connect.stripe.com/oauth/authorize?${params}`;
}

/** OAuth is intentional: owners may connect an existing independent Stripe account. */
export async function exchangeStripeCode(code: string) {
  return providerRequest(
    "https://connect.stripe.com/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: requiredPaymentEnv("STRIPE_SECRET_KEY"),
      }),
    },
    z.object({
      stripe_user_id: z.string().startsWith("acct_"),
      livemode: z.boolean(),
    }),
  );
}

export async function stripeAccount(accountId: string) {
  return stripeRequest(
    `accounts/${encodeURIComponent(accountId)}`,
    null,
    z.object({
      id: z.string(),
      charges_enabled: z.boolean(),
      payouts_enabled: z.boolean(),
      business_profile: z
        .object({ name: z.string().nullable() })
        .nullable()
        .optional(),
      email: z.string().nullable().optional(),
    }),
  );
}

export async function stripeCheckout(
  accountId: string,
  order: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    interval: BillingInterval;
    buyerEmail: string;
    returnUrl: string;
  },
) {
  const recurring = order.interval !== "once";
  const body = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    client_reference_id: order.id,
    customer_email: order.buyerEmail,
    success_url: order.returnUrl,
    cancel_url: order.returnUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": order.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(order.amount),
    "line_items[0][price_data][product_data][name]": order.title,
    "metadata[orderId]": order.id,
  });
  if (recurring) {
    body.set("line_items[0][price_data][recurring][interval]", order.interval);
    body.set("subscription_data[metadata][orderId]", order.id);
  } else body.set("payment_intent_data[metadata][orderId]", order.id);
  // No application_fee_amount or application_fee_percent: AIT takes zero.
  return stripeRequest(
    "checkout/sessions",
    accountId,
    stripeSessionSchema,
    body,
    `checkout-${order.id}`,
  );
}

export async function stripeRefund(
  accountId: string,
  paymentIntent: string,
  amount: number,
  orderId: string,
) {
  return stripeRequest(
    "refunds",
    accountId,
    z.object({ id: z.string(), status: z.string().nullable() }),
    new URLSearchParams({
      payment_intent: paymentIntent,
      amount: String(amount),
    }),
    `refund-${orderId}`,
  );
}

export function stripeCancel(accountId: string, subscriptionId: string) {
  return stripeRequest(
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
    accountId,
    stripeSubscriptionSchema,
    new URLSearchParams({ cancel_at_period_end: "true" }),
  );
}

export function stripePortal(
  accountId: string,
  customerId: string,
  returnUrl: string,
  configurationId: string,
) {
  return stripeRequest(
    "billing_portal/sessions",
    accountId,
    z.object({ url: z.string().url() }),
    new URLSearchParams({
      customer: customerId,
      return_url: returnUrl,
      configuration: configurationId,
    }),
  );
}

export function stripePortalConfiguration(accountId: string) {
  return stripeRequest(
    "billing_portal/configurations",
    accountId,
    z.object({ id: z.string() }),
    new URLSearchParams({
      "features[payment_method_update][enabled]": "true",
      "features[invoice_history][enabled]": "true",
      "features[subscription_cancel][enabled]": "true",
      "features[subscription_cancel][mode]": "at_period_end",
    }),
    `portal-configuration-${accountId}`,
  );
}

export function stripeId(value: z.infer<typeof reference>): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

export async function stripePaymentRefunds(accountId: string, intent: string) {
  const refunds = await stripeRequest(
    `refunds?payment_intent=${encodeURIComponent(intent)}&limit=100`,
    accountId,
    z.object({
      has_more: z.boolean(),
      data: z.array(
        z.object({
          id: z.string(),
          amount: z.number().int().positive(),
          status: z.string().nullable(),
        }),
      ),
    }),
  );
  if (refunds.has_more)
    throw new Error("Payment refund history requires reconciliation.");
  return refunds.data.map((refund) => ({
    id: refund.id,
    amount: refund.amount,
    status:
      refund.status === "succeeded"
        ? ("succeeded" as const)
        : ["failed", "canceled"].includes(refund.status ?? "")
          ? ("failed" as const)
          : ("pending" as const),
  }));
}
