import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { db } from "@/server/db";
import {
  paymentBillingAttempts,
  paymentConnections,
  paymentOrders,
  paymentRefunds,
  paymentSubscriptions,
} from "@/server/db/schema";
import { nextBillingDate } from "@/lib/payments";
import { applyPaymentEvent } from "./payment-events";
import { projectConfirmedRefund } from "./management";
import { verifyAdyenSignature } from "./signatures";
import { adyenCancelAuthorization, adyenCapture } from "./providers/adyen";

export const adyenNotificationSchema = z.object({
  pspReference: z.string(),
  originalReference: z.string().optional(),
  merchantAccountCode: z.string(),
  merchantReference: z.string(),
  amount: z.object({ value: z.number().int(), currency: z.string() }),
  eventCode: z.string(),
  success: z.string(),
  eventDate: z.string().optional(),
  additionalData: z.record(z.string(), z.string()).optional(),
});
const envelopeSchema = z.object({
  notificationItems: z
    .array(z.object({ NotificationRequestItem: adyenNotificationSchema }))
    .max(100),
});

export async function processAdyenEvents(
  database: typeof db,
  raw: unknown,
  secret: string,
) {
  const envelope = envelopeSchema.parse(raw);
  // Validate the complete batch before processing any item.
  for (const { NotificationRequestItem: item } of envelope.notificationItems) {
    if (
      !verifyAdyenSignature(item, secret) ||
      item.merchantAccountCode !== process.env.ADYEN_MERCHANT_ACCOUNT
    )
      throw new Error("Invalid Adyen notification.");
  }
  for (const { NotificationRequestItem: item } of envelope.notificationItems) {
    const referenceId = item.merchantReference.replace(/^refund-/, "");
    if (!z.string().uuid().safeParse(referenceId).success) continue;
    const [order] = await database
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, referenceId))
      .limit(1);
    // REFUND merchantReference may be the locally generated refund request id.
    const [refund] = !order
      ? await database
          .select()
          .from(paymentRefunds)
          .where(eq(paymentRefunds.id, referenceId))
          .limit(1)
      : [];
    const target =
      order ??
      (refund
        ? (
            await database
              .select()
              .from(paymentOrders)
              .where(eq(paymentOrders.id, refund.orderId))
          )[0]
        : null);
    if (!target) continue;
    const [connection] = await database
      .select()
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.id, target.connectionId),
          eq(paymentConnections.provider, "adyen"),
        ),
      );
    if (!connection) continue;
    if (item.eventCode === "AUTHORISATION" && item.success === "true") {
      if (
        item.amount.value !== target.amount ||
        item.amount.currency !== target.currency ||
        !connection.balanceAccountId
      )
        throw new Error("Authorization does not match the order.");
      if (
        target.status === "expired" ||
        target.status === "failed" ||
        (target.status === "pending" &&
          target.reservationUntil &&
          target.reservationUntil < new Date())
      ) {
        await adyenCancelAuthorization(item.pspReference, target.id);
        continue;
      }
      await database
        .update(paymentOrders)
        .set({ providerReference: item.pspReference })
        .where(
          and(
            eq(paymentOrders.id, target.id),
            eq(paymentOrders.status, "pending"),
          ),
        );
      if (!target.captureReference && target.status === "pending") {
        const capture = await adyenCapture(
          connection.balanceAccountId,
          item.pspReference,
          target.amount,
          target.id,
        );
        await database
          .update(paymentOrders)
          .set({ captureReference: capture.pspReference })
          .where(eq(paymentOrders.id, target.id));
      }
      continue; // authorization is not captured money
    }
    if (
      ["REFUND", "REFUND_FAILED", "REFUNDED_REVERSED"].includes(item.eventCode)
    ) {
      if (
        item.originalReference !== target.providerReference ||
        item.amount.currency !== target.currency
      )
        continue;
      await database.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(paymentRefunds)
          .where(
            and(
              eq(paymentRefunds.orderId, target.id),
              eq(paymentRefunds.providerReference, item.pspReference),
            ),
          );
        const status =
          item.eventCode === "REFUND" && item.success === "true"
            ? "succeeded"
            : "failed";
        if (existing)
          await tx
            .update(paymentRefunds)
            .set({ status })
            .where(eq(paymentRefunds.id, existing.id));
        else if (refund)
          await tx
            .update(paymentRefunds)
            .set({ status, providerReference: item.pspReference })
            .where(eq(paymentRefunds.id, refund.id));
        else {
          const pending = (
            await tx
              .select()
              .from(paymentRefunds)
              .where(eq(paymentRefunds.orderId, target.id))
          ).find(
            (request) =>
              request.status === "pending" &&
              !request.providerReference &&
              request.amount === item.amount.value,
          );
          if (pending)
            await tx
              .update(paymentRefunds)
              .set({ providerReference: item.pspReference, status })
              .where(eq(paymentRefunds.id, pending.id));
          else
            await tx
              .insert(paymentRefunds)
              .values({
                orderId: target.id,
                providerReference: item.pspReference,
                amount: item.amount.value,
                status,
              })
              .onConflictDoNothing();
        }
        await projectConfirmedRefund(tx, target.id);
      });
      continue;
    }
    if (
      !["CAPTURE", "CAPTURE_FAILED", "AUTHORISATION", "CANCELLATION"].includes(
        item.eventCode,
      )
    )
      continue;
    const paid = item.eventCode === "CAPTURE" && item.success === "true";
    if (!paid && item.eventCode === "CAPTURE" && item.success !== "true")
      continue;
    const paymentReference = item.originalReference ?? item.pspReference;
    if (
      target.providerReference &&
      target.providerReference !== paymentReference
    )
      throw new Error("Adyen reference mismatch.");
    await applyPaymentEvent(database, {
      eventId: `adyen:${item.pspReference}:${item.eventCode}:${item.success}`,
      connectionId: connection.id,
      orderId: target.id,
      reference: paymentReference,
      amount: item.amount.value,
      currency: item.amount.currency,
      status: paid
        ? "paid"
        : item.eventCode === "CANCELLATION"
          ? "expired"
          : "failed",
    });
    if (target.renewalOf) {
      await database.transaction(async (tx) => {
        const [subscription] = await tx
          .select()
          .from(paymentSubscriptions)
          .where(eq(paymentSubscriptions.orderId, target.renewalOf!))
          .for("update");
        const [attempt] = await tx
          .select()
          .from(paymentBillingAttempts)
          .where(eq(paymentBillingAttempts.id, target.id));
        if (!subscription || !attempt || subscription.status === "canceled")
          return;
        const [root] = await tx
          .select()
          .from(paymentOrders)
          .where(eq(paymentOrders.id, target.renewalOf!));
        if (!root || root.interval === "once" || !subscription.anchor) return;
        if (paid || attempt.status !== "paid")
          await tx
            .update(paymentBillingAttempts)
            .set({
              status: paid ? "paid" : "failed",
              providerReference: paymentReference,
            })
            .where(eq(paymentBillingAttempts.id, attempt.id));
        if (paid && attempt.sequence > subscription.sequence) {
          const through = nextBillingDate(
            subscription.anchor,
            root.interval,
            attempt.sequence + 1,
          );
          await tx
            .update(paymentSubscriptions)
            .set({
              status: "active",
              sequence: attempt.sequence,
              paidThrough: through,
              nextBillAt: subscription.cancelAtPeriodEnd ? null : through,
            })
            .where(eq(paymentSubscriptions.id, subscription.id));
          await tx
            .update(paymentOrders)
            .set({ paidPeriodEnd: through })
            .where(eq(paymentOrders.id, target.id));
        } else if (!paid && attempt.sequence > subscription.sequence)
          await tx
            .update(paymentSubscriptions)
            .set({ status: "past_due" })
            .where(eq(paymentSubscriptions.id, subscription.id));
      });
    }
  }
}

/** This endpoint receives raw-body-signed lifecycle webhooks, not Standard notifications. */
export async function processAdyenToken(database: typeof db, raw: unknown) {
  const event = z
    .object({
      type: z.string(),
      data: z.object({
        merchantAccount: z.string(),
        shopperReference: z.string().uuid(),
        storedPaymentMethodId: z.string().min(1),
      }),
    })
    .parse(raw);
  if (
    ![
      "recurring.token.created",
      "recurring.token.alreadyExisting",
      "recurring.token.updated",
      "recurring.token.disabled",
    ].includes(event.type) ||
    event.data.merchantAccount !== process.env.ADYEN_MERCHANT_ACCOUNT
  )
    return;
  const [order] = await database
    .select({ connectionId: paymentConnections.id })
    .from(paymentOrders)
    .innerJoin(
      paymentConnections,
      eq(paymentConnections.id, paymentOrders.connectionId),
    )
    .where(
      and(
        eq(paymentOrders.id, event.data.shopperReference),
        eq(paymentConnections.provider, "adyen"),
      ),
    );
  if (!order) return;
  await database
    .update(paymentSubscriptions)
    .set({
      token:
        event.type === "recurring.token.disabled"
          ? null
          : event.data.storedPaymentMethodId,
    })
    .where(
      and(
        eq(paymentSubscriptions.orderId, event.data.shopperReference),
        eq(paymentSubscriptions.connectionId, order.connectionId),
      ),
    );
}
