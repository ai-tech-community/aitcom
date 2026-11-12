import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { db } from "@/server/db";
import {
  paymentConnections,
  paymentEvents,
  paymentOrders,
  paymentRefunds,
  paymentSubscriptions,
  paymentCommands,
} from "@/server/db/schema";
import {
  stripeId,
  stripeRequest,
  stripeSessionSchema,
  stripeSubscriptionSchema,
  stripePaymentRefunds,
} from "./providers/stripe";
import { applyPaymentEvent, fulfillPaidOrder } from "./payment-events";
import { projectConfirmedRefund } from "./management";
import { refreshConnection } from "./connections";

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  account: z.string().optional(),
  created: z.number(),
  data: z.object({ object: z.object({ id: z.string() }).passthrough() }),
});
const ref = z
  .union([z.string(), z.object({ id: z.string() })])
  .nullable()
  .optional();
const invoiceSchema = z.object({
  id: z.string(),
  status: z.string().nullable(),
  amount_paid: z.number(),
  currency: z.string(),
  billing_reason: z.string().nullable(),
  subscription: ref,
  lines: z.object({
    data: z.array(
      z.object({
        period: z.object({ start: z.number(), end: z.number() }),
        parent: z
          .object({
            type: z.string().optional(),
            subscription_item_details: z
              .object({ subscription: ref })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
        type: z.string().optional(),
      }),
    ),
  }),
  parent: z
    .object({
      subscription_details: z
        .object({ subscription: ref })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  payments: z
    .object({
      data: z.array(
        z.object({ payment: z.object({ payment_intent: ref }).optional() }),
      ),
    })
    .optional(),
});

export async function processStripeEvent(database: typeof db, raw: unknown) {
  const event = eventSchema.parse(raw);
  if (!event.account) return;
  const [connection] = await database
    .select()
    .from(paymentConnections)
    .where(
      and(
        eq(paymentConnections.provider, "stripe"),
        eq(paymentConnections.accountId, event.account),
      ),
    );
  if (!connection) return;
  if (
    event.type === "account.updated" ||
    event.type === "account.application.deauthorized"
  ) {
    if (event.type === "account.application.deauthorized")
      await database
        .update(paymentConnections)
        .set({ chargesEnabled: false, payoutsEnabled: false })
        .where(eq(paymentConnections.id, connection.id));
    else await refreshConnection(database, connection);
    return;
  }
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  ) {
    const session = await stripeRequest(
      `checkout/sessions/${encodeURIComponent(event.data.object.id)}`,
      connection.accountId,
      stripeSessionSchema,
    );
    const orderId = session.client_reference_id;
    if (!orderId) return;
    const subscriptionId = stripeId(session.subscription);
    const subscription = subscriptionId
      ? await stripeRequest(
          `subscriptions/${encodeURIComponent(subscriptionId)}`,
          connection.accountId,
          stripeSubscriptionSchema,
        )
      : null;
    const through =
      subscription?.items.data[0]?.current_period_end ??
      subscription?.current_period_end;
    const intent = stripeId(session.payment_intent);
    const paid = session.payment_status === "paid";
    if (!paid && event.type === "checkout.session.completed") return;
    // Subscription invoice events supply the first payment intent when Checkout omits it.
    if (paid && subscription) return;
    await applyPaymentEvent(database, {
      eventId: `stripe:${event.id}`,
      connectionId: connection.id,
      orderId,
      reference: intent ?? session.id,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "",
      status: paid
        ? "paid"
        : event.type === "checkout.session.expired"
          ? "expired"
          : "failed",
      subscriptionReference: subscriptionId,
      customerReference: stripeId(session.customer),
      ...(paid && intent
        ? { refunds: await stripePaymentRefunds(connection.accountId!, intent) }
        : {}),
      ...(through ? { paidThrough: new Date(through * 1000) } : {}),
    });
    return;
  }
  if (
    event.type.startsWith("customer.subscription.") ||
    ["invoice.paid", "invoice.payment_failed"].includes(event.type)
  ) {
    const invoice = event.type.startsWith("invoice.")
      ? await stripeRequest(
          `invoices/${encodeURIComponent(event.data.object.id)}?expand[]=payments.data.payment.payment_intent`,
          connection.accountId,
          invoiceSchema,
        )
      : null;
    const subscriptionId = invoice
      ? stripeId(
          invoice.parent?.subscription_details?.subscription ??
            invoice.subscription,
        )
      : event.data.object.id;
    if (!subscriptionId) return;
    const subscription = await stripeRequest(
      `subscriptions/${encodeURIComponent(subscriptionId)}`,
      connection.accountId,
      stripeSubscriptionSchema,
    );
    const orderId = subscription.metadata.orderId;
    if (!orderId) return;
    const [order] = await database
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.id, orderId),
          eq(paymentOrders.connectionId, connection.id),
        ),
      );
    if (!order) return;
    const periodEnd = invoice
      ? Math.max(
          0,
          ...invoice.lines.data
            .filter(
              (line) =>
                line.type === "subscription" ||
                line.parent?.type === "subscription_item_details" ||
                stripeId(
                  line.parent?.subscription_item_details?.subscription,
                ) === subscriptionId,
            )
            .map((line) => line.period.end),
        )
      : 0;
    const through = periodEnd ? new Date(periodEnd * 1000) : null;
    const intent = invoice?.payments?.data
      .map((payment) => stripeId(payment.payment?.payment_intent))
      .find(Boolean);
    const confirmedRefunds =
      invoice?.status === "paid" && intent
        ? await stripePaymentRefunds(connection.accountId!, intent)
        : [];
    const fullyRefunded =
      !!invoice &&
      confirmedRefunds
        .filter((refund) => refund.status === "succeeded")
        .reduce((total, refund) => total + refund.amount, 0) >=
        invoice.amount_paid;
    if (
      invoice?.status === "paid" &&
      invoice.billing_reason === "subscription_create"
    ) {
      if (!intent)
        throw new Error("Subscription payment intent is not available yet.");
      await applyPaymentEvent(database, {
        eventId: `stripe:${event.id}:initial`,
        connectionId: connection.id,
        orderId,
        reference: intent,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: "paid",
        subscriptionReference: subscription.id,
        customerReference: stripeId(subscription.customer),
        refunds: confirmedRefunds,
        ...(through ? { paidThrough: through } : {}),
      });
    }
    await database.transaction(async (tx) => {
      const inserted = await tx
        .insert(paymentEvents)
        .values({ id: `stripe:${event.id}`, connectionId: connection.id })
        .onConflictDoNothing()
        .returning();
      if (!inserted.length) return;
      const [stored] = await tx
        .select()
        .from(paymentSubscriptions)
        .where(eq(paymentSubscriptions.orderId, order.id))
        .for("update");
      if (!stored) return;
      if (stored.cancelAtPeriodEnd && !stored.paidThrough) {
        await tx
          .update(paymentSubscriptions)
          .set({
            providerReference: subscription.id,
            customerReference: stripeId(subscription.customer),
          })
          .where(eq(paymentSubscriptions.id, stored.id));
        await tx
          .insert(paymentCommands)
          .values({
            id: `cancel-order-${order.id}`,
            orderId: order.id,
            kind: "cancel_subscription",
          })
          .onConflictDoUpdate({
            target: paymentCommands.id,
            set: { completedAt: null },
          });
        return;
      }
      if (
        stored.cancelAtPeriodEnd &&
        !subscription.cancel_at_period_end &&
        subscription.status !== "canceled"
      )
        await tx
          .insert(paymentCommands)
          .values({
            id: `cancel-order-${order.id}`,
            orderId: order.id,
            kind: "cancel_subscription",
          })
          .onConflictDoUpdate({
            target: paymentCommands.id,
            set: { completedAt: null },
          });
      if (stored.status === "canceled" && order.status === "refunded") return;
      const stamp = new Date(event.created * 1000);
      const status = ["canceled", "unpaid", "incomplete_expired"].includes(
        subscription.status,
      )
        ? "canceled"
        : subscription.status === "past_due"
          ? "past_due"
          : subscription.status === "active"
            ? "active"
            : "pending";
      await tx
        .update(paymentSubscriptions)
        .set({
          providerReference: subscription.id,
          customerReference: stripeId(subscription.customer),
          ...(!stored.providerUpdatedAt || stored.providerUpdatedAt <= stamp
            ? {
                status,
                cancelAtPeriodEnd:
                  stored.cancelAtPeriodEnd || subscription.cancel_at_period_end,
                providerUpdatedAt: stamp,
              }
            : {}),
          ...(through &&
          invoice?.status === "paid" &&
          !fullyRefunded &&
          (!stored.paidThrough || through > stored.paidThrough)
            ? { paidThrough: through, nextBillAt: through }
            : {}),
        })
        .where(eq(paymentSubscriptions.id, stored.id));
      if (
        invoice?.status === "paid" &&
        invoice.billing_reason !== "subscription_create"
      ) {
        if (
          !intent ||
          invoice.amount_paid !== order.amount ||
          invoice.currency.toUpperCase() !== order.currency
        )
          throw new Error("Renewal payment differs from the agreed price.");
        const id = crypto.randomUUID();
        const renewed = await tx
          .insert(paymentOrders)
          .values({
            ...order,
            id,
            requestKey: id,
            renewalOf: order.id,
            paidPeriodEnd: through,
            status: "paid",
            fulfillment: "pending",
            providerReference: intent,
            checkoutReference: invoice.id,
            checkoutUrl: null,
            createdAt: new Date(),
            reservationUntil: null,
          })
          .onConflictDoNothing()
          .returning();
        if (renewed[0]) {
          if (confirmedRefunds.length) {
            await tx
              .insert(paymentRefunds)
              .values(
                confirmedRefunds.map((refund) => ({
                  orderId: renewed[0]!.id,
                  providerReference: refund.id,
                  amount: refund.amount,
                  status: refund.status,
                })),
              )
              .onConflictDoNothing();
            await projectConfirmedRefund(tx, renewed[0].id);
          }
          if (!fullyRefunded) await fulfillPaidOrder(tx, renewed[0], null);
        }
      }
    });
    return;
  }
  if (
    [
      "charge.refunded",
      "refund.updated",
      "refund.created",
      "refund.failed",
    ].includes(event.type)
  ) {
    const refundObject = event.type.startsWith("refund.")
      ? await stripeRequest(
          `refunds/${encodeURIComponent(event.data.object.id)}`,
          connection.accountId,
          z.object({ charge: ref }),
        )
      : null;
    const chargeId = refundObject
      ? stripeId(refundObject.charge)
      : event.data.object.id;
    if (!chargeId) return;
    const charge = await stripeRequest(
      `charges/${encodeURIComponent(chargeId)}`,
      connection.accountId,
      z.object({
        payment_intent: ref,
        refunds: z.object({
          data: z.array(
            z.object({
              id: z.string(),
              amount: z.number(),
              status: z.string().nullable(),
            }),
          ),
        }),
      }),
    );
    const intent = stripeId(charge.payment_intent);
    if (!intent) return;
    const [order] = await database
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.connectionId, connection.id),
          eq(paymentOrders.providerReference, intent),
        ),
      );
    if (!order) return;
    const refunds = await stripePaymentRefunds(connection.accountId!, intent);
    await database.transaction(async (tx) => {
      await tx
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, order.id))
        .for("update");
      for (const refund of refunds) {
        const status = refund.status;
        // Prefer the locally requested pending record so external events cannot double count it.
        const [existing] = await tx
          .select()
          .from(paymentRefunds)
          .where(
            and(
              eq(paymentRefunds.orderId, order.id),
              eq(paymentRefunds.providerReference, refund.id),
            ),
          );
        if (existing)
          await tx
            .update(paymentRefunds)
            .set({ status, amount: refund.amount })
            .where(eq(paymentRefunds.id, existing.id));
        else {
          const pending = (
            await tx
              .select()
              .from(paymentRefunds)
              .where(eq(paymentRefunds.orderId, order.id))
          ).find(
            (request) =>
              request.status === "pending" &&
              !request.providerReference &&
              request.amount === refund.amount,
          );
          if (pending)
            await tx
              .update(paymentRefunds)
              .set({ providerReference: refund.id, status })
              .where(eq(paymentRefunds.id, pending.id));
          else
            await tx
              .insert(paymentRefunds)
              .values({
                orderId: order.id,
                providerReference: refund.id,
                amount: refund.amount,
                status,
              })
              .onConflictDoNothing();
        }
      }
      await projectConfirmedRefund(tx, order.id);
    });
  }
}
