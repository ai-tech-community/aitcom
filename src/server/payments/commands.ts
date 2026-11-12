import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/server/db";
import {
  paymentCommands,
  paymentConnections,
  paymentOrders,
  paymentSubscriptions,
} from "@/server/db/schema";
import {
  stripeCancel,
  stripeRequest,
  stripeSessionSchema,
} from "./providers/stripe";
import { adyenExpireCheckout } from "./providers/adyen";

/** Durable actions keep external billing consistent after local refunds/cancellations. */
export async function runPaymentCommands(
  database: typeof db,
  deadline = Date.now() + 20000,
) {
  const pending = await database
    .select()
    .from(paymentCommands)
    .where(isNull(paymentCommands.completedAt))
    .orderBy(sql`${paymentCommands.attemptedAt} ASC NULLS FIRST`)
    .limit(5);
  for (const command of pending) {
    if (Date.now() > deadline) break;
    await database
      .update(paymentCommands)
      .set({ attemptedAt: new Date() })
      .where(eq(paymentCommands.id, command.id));
    try {
      await database.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(paymentCommands)
          .where(eq(paymentCommands.id, command.id))
          .for("update");
        if (!current || current.completedAt) return;
        const [order] = await tx
          .select()
          .from(paymentOrders)
          .where(eq(paymentOrders.id, current.orderId));
        if (!order) return;
        const [connection] = await tx
          .select()
          .from(paymentConnections)
          .where(eq(paymentConnections.id, order.connectionId));
        if (!connection?.accountId) return;
        if (current.kind === "cancel_subscription") {
          const [subscription] = await tx
            .select()
            .from(paymentSubscriptions)
            .where(eq(paymentSubscriptions.orderId, order.id));
          if (
            connection.provider === "stripe" &&
            subscription?.status === "pending" &&
            !subscription.providerReference
          ) {
            throw new Error(
              "Waiting for checkout reconciliation before cancellation.",
            );
          }
          if (
            connection.provider === "stripe" &&
            subscription?.providerReference
          ) {
            const currentSubscription = await stripeRequest(
              `subscriptions/${encodeURIComponent(subscription.providerReference)}`,
              connection.accountId,
              z.object({ status: z.string() }),
            );
            if (currentSubscription.status !== "canceled")
              await stripeCancel(
                connection.accountId,
                subscription.providerReference,
              );
          }
          if (subscription)
            await tx
              .update(paymentSubscriptions)
              .set({ cancelAtPeriodEnd: true, nextBillAt: null })
              .where(eq(paymentSubscriptions.id, subscription.id));
        } else if (order.checkoutReference) {
          if (connection.provider === "stripe") {
            const session = await stripeRequest(
              `checkout/sessions/${encodeURIComponent(order.checkoutReference)}`,
              connection.accountId,
              stripeSessionSchema,
            );
            if (session.status === "open")
              await stripeRequest(
                `checkout/sessions/${encodeURIComponent(order.checkoutReference)}/expire`,
                connection.accountId,
                z.object({ id: z.string() }),
                new URLSearchParams(),
                `expire-${order.id}`,
              );
            else if (session.status === "complete")
              throw new Error(
                "Awaiting completed checkout payment reconciliation.",
              );
          } else await adyenExpireCheckout(order.checkoutReference);
          await tx
            .update(paymentSubscriptions)
            .set({
              status: "canceled",
              cancelAtPeriodEnd: true,
              nextBillAt: null,
            })
            .where(
              and(
                eq(paymentSubscriptions.orderId, order.id),
                eq(paymentSubscriptions.status, "pending"),
              ),
            );
        } else if (current.kind === "expire_checkout") {
          // A timed-out creation might have succeeded remotely. Keep its uniqueness
          // guard until a stable-key retry or provider event supplies its reference.
          throw new Error("Checkout identity requires reconciliation.");
        }
        await tx
          .update(paymentCommands)
          .set({ completedAt: new Date() })
          .where(eq(paymentCommands.id, current.id));
      });
    } catch {
      console.error("[payments] provider synchronization requires retry", {
        commandId: command.id,
      });
    }
  }
}
