import { and, asc, desc, eq, inArray, lt, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  paymentBillingAttempts,
  paymentComplimentaryMembers,
  paymentConnections,
  paymentOrders,
  paymentPolicies,
  paymentSubscriptions,
  eventRegistrations,
  paymentCommands,
} from "@/server/db/schema";
import { hasPaidAccess } from "@/lib/payments";
import { adyenCheckout, adyenRenew } from "./providers/adyen";
import { paymentAppUrl } from "./providers/http";
import { refreshConnection } from "./connections";
import { paymentsEnabled } from "./access";
import { drainPaymentOutbox } from "./outbox";
import { runPaymentCommands } from "./commands";

/** Creates a durable charge identity before any external request is made. */
async function prepareBillingAttempt(
  database: typeof db,
  id: string,
  recovery = false,
) {
  return database.transaction(async (tx) => {
    const [subscription] = await tx
      .select()
      .from(paymentSubscriptions)
      .where(eq(paymentSubscriptions.id, id))
      .for("update");
    if (
      !subscription ||
      subscription.cancelAtPeriodEnd ||
      subscription.status === "canceled" ||
      subscription.status === "pending"
    )
      return null;
    const [root] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, subscription.orderId));
    if (!root || root.interval === "once" || root.fulfillment !== "fulfilled")
      return null;
    const [connection] = await tx
      .select()
      .from(paymentConnections)
      .where(eq(paymentConnections.id, subscription.connectionId));
    if (connection?.provider !== "adyen") return null;
    const previous = await tx
      .select()
      .from(paymentBillingAttempts)
      .where(
        and(
          eq(paymentBillingAttempts.subscriptionId, id),
          eq(paymentBillingAttempts.sequence, subscription.sequence + 1),
        ),
      )
      .orderBy(desc(paymentBillingAttempts.attempt));
    if (previous[0] && (!recovery || previous[0].status !== "failed"))
      return { subscription, root, connection, attempt: previous[0] };
    const attemptId = crypto.randomUUID();
    const [attempt] = await tx
      .insert(paymentBillingAttempts)
      .values({
        id: attemptId,
        subscriptionId: id,
        sequence: subscription.sequence + 1,
        attempt: previous.length,
      })
      .returning();
    await tx.insert(paymentOrders).values({
      ...root,
      id: attemptId,
      requestKey: attemptId,
      interval: "once",
      renewalOf: root.id,
      status: "pending",
      fulfillment: "pending",
      providerReference: null,
      checkoutReference: null,
      captureReference: null,
      checkoutUrl: null,
      paidPeriodEnd: null,
      receiptUrl: null,
      reservationUntil: new Date(Date.now() + 30 * 60000),
      createdAt: new Date(),
    });
    return { subscription, root, connection, attempt: attempt! };
  });
}

export async function recoverAdyenSubscription(
  database: typeof db,
  userId: string,
  id: string,
  _locale: string,
) {
  const [subscription] = await database
    .select()
    .from(paymentSubscriptions)
    .where(
      and(
        eq(paymentSubscriptions.id, id),
        eq(paymentSubscriptions.userId, userId),
      ),
    );
  if (subscription?.status !== "past_due")
    throw new TRPCError({ code: "PRECONDITION_FAILED" });
  const prepared = await prepareBillingAttempt(database, id, true);
  if (
    prepared?.attempt.status !== "pending" ||
    prepared.attempt.providerReference
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Wait for the existing payment to finish.",
    });
  const connection = await refreshConnection(database, prepared.connection);
  if (
    !connection.chargesEnabled ||
    !connection.balanceAccountId ||
    !connection.storeId
  )
    throw new TRPCError({ code: "PRECONDITION_FAILED" });
  const [community] = await database
    .select()
    .from(communities)
    .where(eq(communities.id, subscription.communityId));
  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(paymentSubscriptions)
      .where(eq(paymentSubscriptions.id, id))
      .for("update");
    if (
      current?.userId !== userId ||
      current.cancelAtPeriodEnd ||
      current.status !== "past_due"
    )
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    const [attempt] = await tx
      .select()
      .from(paymentBillingAttempts)
      .where(eq(paymentBillingAttempts.id, prepared.attempt.id))
      .for("update");
    if (
      attempt?.status !== "pending" ||
      attempt.providerReference ||
      Date.now() >= attempt.createdAt.getTime() + 30 * 60000
    )
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    const result = await adyenCheckout(
      connection.balanceAccountId!,
      connection.storeId!,
      {
        ...prepared.root,
        id: prepared.attempt.id,
        shopperReference: prepared.root.id,
        reservationUntil: new Date(
          prepared.attempt.createdAt.getTime() + 30 * 60000,
        ),
        returnUrl: `${paymentAppUrl()}/${prepared.root.checkoutLocale}/dashboard/payments`,
      },
    );
    await tx
      .update(paymentOrders)
      .set({ checkoutReference: result.id, checkoutUrl: result.url })
      .where(eq(paymentOrders.id, prepared.attempt.id));
    return { url: result.url, community: community?.slug };
  });
}

export async function runPaymentMaintenance(
  database: typeof db,
  now = new Date(),
) {
  if (!paymentsEnabled()) return { dispatched: 0, expired: 0 };
  const due = await database
    .select({ id: paymentSubscriptions.id })
    .from(paymentSubscriptions)
    .innerJoin(
      paymentConnections,
      eq(paymentConnections.id, paymentSubscriptions.connectionId),
    )
    .where(
      and(
        eq(paymentConnections.provider, "adyen"),
        eq(paymentSubscriptions.status, "active"),
        eq(paymentSubscriptions.cancelAtPeriodEnd, false),
        lte(paymentSubscriptions.nextBillAt, now),
      ),
    )
    .orderBy(asc(paymentSubscriptions.nextBillAt))
    .limit(20);
  let dispatched = 0;
  const deadline = Date.now() + 25000;
  for (const { id } of due) {
    if (Date.now() > deadline) break;
    const prepared = await prepareBillingAttempt(database, id);
    if (
      !prepared ||
      !["pending", "unknown"].includes(prepared.attempt.status) ||
      prepared.attempt.providerReference
    ) {
      await database
        .update(paymentSubscriptions)
        .set({ nextBillAt: new Date(now.getTime() + 5 * 60000) })
        .where(eq(paymentSubscriptions.id, id));
      continue;
    }
    const connection = await refreshConnection(database, prepared.connection);
    if (
      !connection.chargesEnabled ||
      !connection.balanceAccountId ||
      !connection.storeId ||
      !prepared.subscription.token
    ) {
      await database
        .update(paymentSubscriptions)
        .set({ status: "past_due", nextBillAt: null })
        .where(eq(paymentSubscriptions.id, id));
      continue;
    }
    await database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(paymentSubscriptions)
        .where(eq(paymentSubscriptions.id, id))
        .for("update");
      if (!current || current.cancelAtPeriodEnd || current.status !== "active")
        return;
      const [attempt] = await tx
        .select()
        .from(paymentBillingAttempts)
        .where(eq(paymentBillingAttempts.id, prepared.attempt.id))
        .for("update");
      if (
        !attempt ||
        attempt.providerReference ||
        !["pending", "unknown"].includes(attempt.status)
      )
        return;
      if (now.getTime() - attempt.createdAt.getTime() > 23 * 3600000) {
        await tx
          .update(paymentSubscriptions)
          .set({ status: "past_due" })
          .where(eq(paymentSubscriptions.id, id));
        return; // never issue a fresh key for a charge with an unknown outcome
      }
      await tx
        .update(paymentSubscriptions)
        .set({ nextBillAt: new Date(now.getTime() + 5 * 60000) })
        .where(eq(paymentSubscriptions.id, id));
      try {
        const result = await adyenRenew(
          connection.balanceAccountId!,
          connection.storeId!,
          {
            id: attempt.id,
            amount: prepared.root.amount,
            token: current.token!,
            shopperReference: prepared.root.id,
          },
        );
        const failed = ["Refused", "Error", "Cancelled"].includes(
          result.resultCode,
        );
        await tx
          .update(paymentBillingAttempts)
          .set({
            providerReference: result.pspReference ?? null,
            status: failed ? "failed" : "pending",
          })
          .where(eq(paymentBillingAttempts.id, attempt.id));
        if (failed) {
          await tx
            .update(paymentSubscriptions)
            .set({ status: "past_due" })
            .where(eq(paymentSubscriptions.id, id));
          await tx
            .update(paymentOrders)
            .set({ status: "failed" })
            .where(eq(paymentOrders.id, attempt.id));
        }
        dispatched++;
      } catch {
        await tx
          .update(paymentBillingAttempts)
          .set({ status: "unknown" })
          .where(eq(paymentBillingAttempts.id, attempt.id));
      }
    });
  }
  const expiring = await database
    .select()
    .from(paymentSubscriptions)
    .where(
      and(
        inArray(paymentSubscriptions.status, ["active", "past_due"]),
        lt(paymentSubscriptions.paidThrough, now),
      ),
    )
    .limit(100);
  let expired = 0;
  for (const subscription of expiring) {
    if (hasPaidAccess(subscription, now)) continue;
    if (subscription.cancelAtPeriodEnd)
      await database
        .update(paymentSubscriptions)
        .set({ status: "canceled" })
        .where(eq(paymentSubscriptions.id, subscription.id));
    if (!subscription.userId) continue;
    const [order] = await database
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.id, subscription.orderId));
    const [policy] = await database
      .select()
      .from(paymentPolicies)
      .where(eq(paymentPolicies.communityId, subscription.communityId));
    if (order?.kind !== "membership" || !policy?.paidEntryAt) continue;
    const [complimentary] = await database
      .select()
      .from(paymentComplimentaryMembers)
      .where(
        and(
          eq(paymentComplimentaryMembers.communityId, subscription.communityId),
          eq(paymentComplimentaryMembers.userId, subscription.userId),
        ),
      );
    if (complimentary) continue;
    const others = await database
      .select({ subscription: paymentSubscriptions })
      .from(paymentSubscriptions)
      .innerJoin(
        paymentOrders,
        eq(paymentOrders.id, paymentSubscriptions.orderId),
      )
      .where(
        and(
          eq(paymentSubscriptions.communityId, subscription.communityId),
          eq(paymentSubscriptions.userId, subscription.userId),
          eq(paymentOrders.kind, "membership"),
        ),
      );
    if (
      others.some(({ subscription: candidate }) =>
        hasPaidAccess(candidate, now),
      )
    )
      continue;
    await database
      .update(communityMemberships)
      .set({ status: "invited" })
      .where(
        and(
          eq(communityMemberships.communityId, subscription.communityId),
          eq(communityMemberships.userId, subscription.userId),
          eq(communityMemberships.role, "member"),
          eq(communityMemberships.status, "active"),
        ),
      );
    expired++;
  }
  await database.transaction(async (tx) => {
    const expiredOrders = await tx
      .update(paymentOrders)
      .set({ status: "expired" })
      .where(
        and(
          eq(paymentOrders.status, "pending"),
          lt(paymentOrders.reservationUntil, now),
        ),
      )
      .returning({ id: paymentOrders.id });
    if (!expiredOrders.length) return;
    const ids = expiredOrders.map((order) => order.id);
    await tx
      .update(eventRegistrations)
      .set({ status: "payment_failed", paymentStatus: "expired" })
      .where(
        and(
          inArray(eventRegistrations.paymentId, ids),
          eq(eventRegistrations.status, "pending_payment"),
        ),
      );
    await tx
      .update(paymentSubscriptions)
      .set({ cancelAtPeriodEnd: true, nextBillAt: null })
      .where(
        and(
          inArray(paymentSubscriptions.orderId, ids),
          eq(paymentSubscriptions.status, "pending"),
        ),
      );
    await tx
      .insert(paymentCommands)
      .values(
        ids.map((orderId) => ({
          id: `expire-${orderId}`,
          orderId,
          kind: "expire_checkout" as const,
        })),
      )
      .onConflictDoNothing();
  });
  if (Date.now() < deadline) await runPaymentCommands(database, deadline);
  if (Date.now() < deadline) await drainPaymentOutbox(database, now);
  return { dispatched, expired };
}
