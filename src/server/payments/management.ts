import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import {
  communityMemberships,
  eventRegistrations,
  paymentConnections,
  paymentOrders,
  paymentRefunds,
  paymentSubscriptions,
  paymentCommands,
} from "@/server/db/schema";
import { stripeCancel, stripeRefund } from "./providers/stripe";
import { adyenRefund } from "./providers/adyen";
import { paymentsEnabled, type PaymentDatabase } from "./access";

/** Stop membership billing before removing admission; voluntary support remains independent. */
export async function stopCommunityMembershipBilling(
  database: typeof db,
  communityId: string,
  userId: string,
) {
  if (!paymentsEnabled()) return;
  await database.transaction(async (tx) => {
    const subscriptions = await tx
      .select({ subscription: paymentSubscriptions })
      .from(paymentSubscriptions)
      .innerJoin(
        paymentOrders,
        eq(paymentOrders.id, paymentSubscriptions.orderId),
      )
      .where(
        and(
          eq(paymentSubscriptions.communityId, communityId),
          eq(paymentSubscriptions.userId, userId),
          eq(paymentOrders.kind, "membership"),
          inArray(paymentSubscriptions.status, [
            "pending",
            "active",
            "past_due",
          ]),
        ),
      )
      .for("update", { of: paymentSubscriptions });
    for (const { subscription } of subscriptions) {
      await tx
        .update(paymentSubscriptions)
        .set({ cancelAtPeriodEnd: true, nextBillAt: null })
        .where(eq(paymentSubscriptions.id, subscription.id));
      await tx
        .insert(paymentCommands)
        .values({
          id: `cancel-${subscription.id}`,
          orderId: subscription.orderId,
          kind: "cancel_subscription",
        })
        .onConflictDoUpdate({
          target: paymentCommands.id,
          set: { completedAt: null },
        });
      if (subscription.status === "pending")
        await tx
          .insert(paymentCommands)
          .values({
            id: `expire-${subscription.orderId}`,
            orderId: subscription.orderId,
            kind: "expire_checkout",
          })
          .onConflictDoNothing();
    }
  });
}

export async function cancelPaymentSubscription(
  database: typeof db,
  actorId: string,
  id: string,
) {
  return database.transaction(async (tx) => {
    const [subscription] = await tx
      .select()
      .from(paymentSubscriptions)
      .where(eq(paymentSubscriptions.id, id))
      .for("update");
    if (!subscription) throw new TRPCError({ code: "NOT_FOUND" });
    const [owner] = await tx
      .select()
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, subscription.communityId),
          eq(communityMemberships.userId, actorId),
          eq(communityMemberships.role, "owner"),
          eq(communityMemberships.status, "active"),
        ),
      );
    if (subscription.userId !== actorId && !owner)
      throw new TRPCError({ code: "FORBIDDEN" });
    if (subscription.cancelAtPeriodEnd || subscription.status === "canceled")
      return { ok: true };
    if (subscription.status === "pending")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Checkout has not completed.",
      });
    const [connection] = await tx
      .select()
      .from(paymentConnections)
      .where(eq(paymentConnections.id, subscription.connectionId));
    if (!connection?.accountId)
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    if (
      owner &&
      subscription.userId !== actorId &&
      connection.ownerId !== actorId
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Resolve financial account authority first.",
      });
    // The row lock serializes Adyen dispatch against cancellation.
    if (connection.provider === "stripe" && subscription.providerReference)
      await stripeCancel(connection.accountId, subscription.providerReference);
    await tx
      .update(paymentSubscriptions)
      .set({ cancelAtPeriodEnd: true, nextBillAt: null })
      .where(eq(paymentSubscriptions.id, id));
    return { ok: true };
  });
}

export async function projectConfirmedRefund(
  tx: PaymentDatabase,
  orderId: string,
) {
  const [order] = await tx
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, orderId))
    .for("update");
  if (!order) return;
  const [{ total } = { total: 0 }] = await tx
    .select({
      total: sql<number>`coalesce(sum(${paymentRefunds.amount}), 0)::int`,
    })
    .from(paymentRefunds)
    .where(
      and(
        eq(paymentRefunds.orderId, orderId),
        eq(paymentRefunds.status, "succeeded"),
      ),
    );
  if (Number(total) < order.amount) return;
  await tx
    .update(paymentOrders)
    .set({ status: "refunded", fulfillment: "revoked" })
    .where(eq(paymentOrders.id, orderId));
  const rootId = order.renewalOf ?? orderId;
  const [subscription] = await tx
    .select()
    .from(paymentSubscriptions)
    .where(eq(paymentSubscriptions.orderId, rootId));
  if (
    subscription &&
    (!order.paidPeriodEnd ||
      !subscription.paidThrough ||
      order.paidPeriodEnd >= subscription.paidThrough)
  ) {
    await tx
      .insert(paymentCommands)
      .values({
        id: `cancel-${subscription.id}`,
        orderId: rootId,
        kind: "cancel_subscription",
      })
      .onConflictDoUpdate({
        target: paymentCommands.id,
        set: { completedAt: null },
      });
    await tx
      .update(paymentSubscriptions)
      .set({
        status: "canceled",
        cancelAtPeriodEnd: true,
        nextBillAt: null,
        paidThrough: null,
      })
      .where(eq(paymentSubscriptions.id, subscription.id));
  }
  if (order.kind === "event")
    await tx
      .update(eventRegistrations)
      .set({ status: "cancelled", paymentStatus: "refunded" })
      .where(
        and(
          eq(eventRegistrations.paymentId, orderId),
          inArray(eventRegistrations.status, ["registered", "pending_payment"]),
        ),
      );
}

export async function refundPayment(
  database: typeof db,
  communityId: string,
  actorId: string,
  orderId: string,
) {
  const prepared = await database.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.id, orderId),
          eq(paymentOrders.communityId, communityId),
        ),
      )
      .for("update");
    if (
      !order?.providerReference ||
      !["paid", "refund_pending"].includes(order.status)
    )
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    const [connection] = await tx
      .select()
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.id, order.connectionId),
          eq(paymentConnections.ownerId, actorId),
        ),
      );
    if (!connection?.accountId) throw new TRPCError({ code: "FORBIDDEN" });
    const refunds = await tx
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.orderId, order.id));
    const existing = refunds.find((refund) => refund.status === "pending");
    const amount =
      order.amount -
      refunds
        .filter((refund) => refund.status === "succeeded")
        .reduce((total, refund) => total + refund.amount, 0);
    if (amount <= 0) throw new TRPCError({ code: "CONFLICT" });
    const refund =
      existing ??
      (
        await tx
          .insert(paymentRefunds)
          .values({ orderId: order.id, amount, status: "pending" })
          .returning()
      )[0]!;
    if (Date.now() - refund.createdAt.getTime() > 23 * 3600000)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Reconcile the existing refund with the provider before retrying.",
      });
    await tx
      .update(paymentOrders)
      .set({ status: "refund_pending" })
      .where(eq(paymentOrders.id, order.id));
    return { order, connection, refund };
  });
  const { connection, order, refund } = prepared;
  // Cancel renewal first; a refund must never leave future billing running.
  const subscriptions = await database
    .select()
    .from(paymentSubscriptions)
    .where(eq(paymentSubscriptions.orderId, order.renewalOf ?? order.id));
  for (const subscription of subscriptions)
    if (subscription.status !== "pending" && subscription.status !== "canceled")
      await cancelPaymentSubscription(database, actorId, subscription.id);
  if (connection.provider === "stripe") {
    const result = await stripeRefund(
      connection.accountId!,
      order.providerReference!,
      refund.amount,
      refund.id,
    );
    await database.transaction(async (tx) => {
      await tx
        .update(paymentRefunds)
        .set({
          providerReference: result.id,
          status:
            result.status === "succeeded"
              ? "succeeded"
              : result.status === "failed" || result.status === "canceled"
                ? "failed"
                : "pending",
        })
        .where(eq(paymentRefunds.id, refund.id));
      await projectConfirmedRefund(tx, order.id);
      if (result.status === "failed" || result.status === "canceled")
        await tx
          .update(paymentOrders)
          .set({ status: "paid" })
          .where(eq(paymentOrders.id, order.id));
    });
  } else {
    const result = await adyenRefund(
      connection.balanceAccountId!,
      order.providerReference!,
      refund.amount,
      refund.id,
    );
    await database
      .update(paymentRefunds)
      .set({ providerReference: result.pspReference })
      .where(eq(paymentRefunds.id, refund.id));
  }
  return { ok: true };
}
