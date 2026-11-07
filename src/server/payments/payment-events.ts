import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/server/db";
import {
  communityMemberships,
  eventRegistrations,
  paymentEvents,
  paymentOrders,
  paymentSubscriptions,
  activityEvents,
  courseEnrollments,
  paymentOutbox,
  paymentRefunds,
  paymentCommands,
} from "@/server/db/schema";
import {
  canTransitionPayment,
  hasPaidAccess,
  nextBillingDate,
  type PaymentStatus,
} from "@/lib/payments";
import { getPayloadClient } from "@/server/payload";
import type { PaymentDatabase } from "./access";
import { writeActiveRow } from "@/server/communities/activate-membership";
import { scrubJoinedReferralEmails } from "@/server/communities/referral-email/privacy";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { projectConfirmedRefund } from "./management";

export interface ConfirmedPaymentEvent {
  eventId: string;
  connectionId: string;
  orderId: string;
  reference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  subscriptionReference?: string | null;
  customerReference?: string | null;
  paidThrough?: Date;
  token?: string;
  refunds?: {
    id: string;
    amount: number;
    status: "pending" | "succeeded" | "failed";
  }[];
}

export async function fulfillPaidOrder(
  tx: PaymentDatabase,
  order: typeof paymentOrders.$inferSelect,
  capacity: number | null,
) {
  if (order.fulfillment === "fulfilled") return;
  if (!order.buyerId && order.kind !== "donation")
    throw new Error("Purchase requires a buyer.");
  if (order.kind === "event") {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"event-payment-" + order.resourceId}, 0))`,
    );
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, order.resourceId!),
          inArray(eventRegistrations.status, ["registered", "attended"]),
        ),
      );
    if (capacity !== null && Number(count) >= capacity) {
      await tx
        .update(paymentOrders)
        .set({ fulfillment: "refund_required" })
        .where(eq(paymentOrders.id, order.id));
      await tx
        .update(eventRegistrations)
        .set({ status: "payment_failed", paymentStatus: "paid_no_seat" })
        .where(eq(eventRegistrations.paymentId, order.id));
      return;
    }
    const registered = await tx
      .update(eventRegistrations)
      .set({ status: "registered", paymentStatus: "paid" })
      .where(
        and(
          eq(eventRegistrations.paymentId, order.id),
          inArray(eventRegistrations.status, [
            "pending_payment",
            "payment_failed",
          ]),
        ),
      )
      .returning({ id: eventRegistrations.id });
    if (!registered.length) {
      await tx
        .update(paymentOrders)
        .set({ fulfillment: "refund_required" })
        .where(eq(paymentOrders.id, order.id));
      return;
    }
    await awardXp(
      tx as Parameters<typeof awardXp>[0],
      order.buyerId!,
      XP_AMOUNTS.REGISTER_EVENT,
      "event.register",
    );
  }
  if (order.kind === "membership") {
    const [membership] = await tx
      .select()
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, order.communityId),
          eq(communityMemberships.userId, order.buyerId!),
        ),
      );
    const rootId = order.renewalOf ?? order.id;
    const subscriptions = await tx
      .select({ subscription: paymentSubscriptions })
      .from(paymentSubscriptions)
      .innerJoin(
        paymentOrders,
        eq(paymentOrders.id, paymentSubscriptions.orderId),
      )
      .where(
        and(
          eq(paymentSubscriptions.userId, order.buyerId!),
          eq(paymentSubscriptions.communityId, order.communityId),
          eq(paymentOrders.kind, "membership"),
        ),
      );
    const duplicate = subscriptions.some(
      ({ subscription }) =>
        subscription.orderId !== rootId &&
        hasPaidAccess(subscription, new Date()),
    );
    if (
      !membership ||
      !["active", "invited"].includes(membership.status) ||
      duplicate
    ) {
      await tx
        .update(paymentOrders)
        .set({ fulfillment: "refund_required" })
        .where(eq(paymentOrders.id, order.id));
      await tx
        .insert(paymentCommands)
        .values({
          id: `cancel-order-${rootId}`,
          orderId: rootId,
          kind: "cancel_subscription",
        })
        .onConflictDoNothing();
      return;
    }
    if (
      !(await writeActiveRow(tx as Parameters<typeof writeActiveRow>[0], {
        communityId: order.communityId,
        userId: order.buyerId!,
        existing: membership ?? null,
      }))
    )
      throw new Error("Membership changed during payment.");
    await scrubJoinedReferralEmails(
      tx as Parameters<typeof scrubJoinedReferralEmails>[0],
      order.buyerId!,
      order.communityId,
    );
    if (membership.status !== "active")
      await tx
        .insert(activityEvents)
        .values({
          id: `paid-join-${order.id}`,
          actorId: order.buyerId!,
          actorType: "member",
          action: "community.joined",
          targetType: "community",
          targetId: order.communityId,
          communityId: order.communityId,
          metadata: { via: "payment" },
        })
        .onConflictDoNothing();
  }
  if (order.kind === "course")
    await tx
      .insert(courseEnrollments)
      .values({ courseId: order.resourceId!, userId: order.buyerId! })
      .onConflictDoNothing();
  if (order.kind === "event" || order.kind === "course")
    await tx
      .insert(paymentOutbox)
      .values({ orderId: order.id })
      .onConflictDoNothing();
  await tx
    .update(paymentOrders)
    .set({ fulfillment: "fulfilled" })
    .where(eq(paymentOrders.id, order.id));
}

export async function applyPaymentEvent(
  database: typeof db,
  event: ConfirmedPaymentEvent,
) {
  const [snapshot] = await database
    .select()
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.id, event.orderId),
        eq(paymentOrders.connectionId, event.connectionId),
      ),
    );
  if (
    snapshot?.amount !== event.amount ||
    snapshot.currency.toUpperCase() !== event.currency.toUpperCase()
  )
    throw new Error("Payment scope or amount does not match the order.");
  let capacity: number | null = null;
  if (snapshot.kind === "event" && event.status === "paid") {
    const target = await (
      await getPayloadClient()
    ).findByID({
      collection: "events",
      id: snapshot.resourceId!,
      depth: 0,
      disableErrors: true,
    });
    if (
      target?.communityId !== snapshot.communityId ||
      target.status !== "published"
    )
      capacity = 0;
    else capacity = target.maxAttendees ?? null;
  }
  await database.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({ id: event.eventId, connectionId: event.connectionId })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return;
    const [order] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, snapshot.id))
      .for("update");
    if (!order || !canTransitionPayment(order.status, event.status)) return;
    await tx
      .update(paymentOrders)
      .set({
        status: event.status,
        providerReference: event.reference,
        receiptUrl: event.receiptUrl ?? order.receiptUrl,
        ...(event.paidThrough ? { paidPeriodEnd: event.paidThrough } : {}),
      })
      .where(eq(paymentOrders.id, order.id));
    if (event.status === "paid") {
      if (event.refunds?.length) {
        await tx
          .insert(paymentRefunds)
          .values(
            event.refunds.map((refund) => ({
              orderId: order.id,
              providerReference: refund.id,
              amount: refund.amount,
              status: refund.status,
            })),
          )
          .onConflictDoNothing();
        await projectConfirmedRefund(tx, order.id);
        if (
          event.refunds
            .filter((refund) => refund.status === "succeeded")
            .reduce((total, refund) => total + refund.amount, 0) >= order.amount
        )
          return;
      }
      if (order.interval !== "once") {
        const [subscription] = await tx
          .select()
          .from(paymentSubscriptions)
          .where(eq(paymentSubscriptions.orderId, order.id))
          .for("update");
        if (subscription?.cancelAtPeriodEnd || order.status === "expired") {
          await tx
            .update(paymentSubscriptions)
            .set({
              cancelAtPeriodEnd: true,
              nextBillAt: null,
              providerReference:
                event.subscriptionReference ?? subscription?.providerReference,
              customerReference:
                event.customerReference ?? subscription?.customerReference,
            })
            .where(eq(paymentSubscriptions.orderId, order.id));
          await tx
            .update(paymentOrders)
            .set({ fulfillment: "refund_required" })
            .where(eq(paymentOrders.id, order.id));
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
        const anchor = new Date();
        const through =
          event.paidThrough ?? nextBillingDate(anchor, order.interval);
        await tx
          .update(paymentOrders)
          .set({ paidPeriodEnd: through })
          .where(eq(paymentOrders.id, order.id));
        await tx
          .update(paymentSubscriptions)
          .set({
            status: "active",
            anchor,
            paidThrough: through,
            nextBillAt: through,
            providerReference: event.subscriptionReference ?? null,
            customerReference: event.customerReference ?? null,
            ...(event.token ? { token: event.token } : {}),
          })
          .where(
            and(
              eq(paymentSubscriptions.orderId, order.id),
              inArray(paymentSubscriptions.status, ["pending", "canceled"]),
            ),
          );
      }
      await fulfillPaidOrder(tx, order, capacity);
    } else if (event.status === "failed" || event.status === "expired") {
      if (order.interval !== "once")
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
      await tx
        .update(eventRegistrations)
        .set({ status: "payment_failed", paymentStatus: event.status })
        .where(
          and(
            eq(eventRegistrations.paymentId, order.id),
            eq(eventRegistrations.status, "pending_payment"),
          ),
        );
    }
  });
}
