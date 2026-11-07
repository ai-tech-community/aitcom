import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import {
  communities,
  communityMemberships,
  eventRegistrations,
  paymentConnections,
  paymentOffers,
  paymentOrders,
  paymentPolicies,
  paymentSubscriptions,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { externalEventUrl } from "@/lib/events/event-source";
import {
  membershipPaymentAllowed,
  paymentMembership,
  paymentsEnabled,
} from "./access";
import { providerAvailable, refreshConnection } from "./connections";
import { stripeCheckout } from "./providers/stripe";
import { adyenCheckout } from "./providers/adyen";
import { paymentAppUrl } from "./providers/http";

export async function findResourceOffer(
  database: typeof db,
  communityId: string,
  kind: "event" | "course",
  resourceId: number,
) {
  if (!paymentsEnabled()) return null;
  const [offer] = await database
    .select()
    .from(paymentOffers)
    .where(
      and(
        eq(paymentOffers.communityId, communityId),
        eq(paymentOffers.kind, kind),
        eq(paymentOffers.resourceId, resourceId),
        isNotNull(paymentOffers.publishedAt),
      ),
    )
    .orderBy(desc(paymentOffers.createdAt))
    .limit(1);
  return offer ?? null;
}

export async function startCheckout(
  database: typeof db,
  input: {
    offerId: string;
    buyerId: string | null;
    email: string;
    requestKey: string;
    consent: boolean;
    amount?: number;
    locale: string;
    preparedEvent?: {
      maxAttendees: number | null;
      answers: typeof eventRegistrations.$inferInsert.answers;
      registrationId?: string;
    };
  },
) {
  if (!paymentsEnabled()) throw new TRPCError({ code: "PRECONDITION_FAILED" });
  const [offer] = await database
    .select()
    .from(paymentOffers)
    .where(
      and(
        eq(paymentOffers.id, input.offerId),
        eq(paymentOffers.published, true),
      ),
    )
    .limit(1);
  if (!offer) throw new TRPCError({ code: "NOT_FOUND" });
  const [community] = await database
    .select()
    .from(communities)
    .where(
      and(eq(communities.id, offer.communityId), isNull(communities.deletedAt)),
    )
    .limit(1);
  if (!community) throw new TRPCError({ code: "NOT_FOUND" });
  if (offer.kind !== "donation" || offer.interval !== "once") {
    if (!input.buyerId) throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (offer.interval !== "once" && !input.consent)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Recurring payment consent is required.",
    });
  if (offer.interval !== "once" && originalAdyenRecurringUnavailable()) {
    const [provider] = await database
      .select({ provider: paymentConnections.provider })
      .from(paymentConnections)
      .where(eq(paymentConnections.id, offer.connectionId));
    if (provider?.provider === "adyen")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Recurring payment setup is incomplete.",
      });
  }
  const membership = input.buyerId
    ? await paymentMembership(database, community.id, input.buyerId)
    : null;
  if (membership?.status === "banned")
    throw new TRPCError({ code: "FORBIDDEN" });
  if (
    offer.kind !== "donation" &&
    community.joinPolicy !== "open" &&
    membership?.status !== "active" &&
    membership?.status !== "invited"
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Community admission is required before purchasing.",
    });
  if (
    offer.kind === "membership" &&
    membership?.status === "active" &&
    (await membershipPaymentAllowed(database, community.id, input.buyerId!))
  )
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "You are already a member. Manage your current subscription instead.",
    });
  if (offer.kind === "course") {
    const course = await (
      await getPayloadClient()
    ).findByID({
      collection: "courses",
      id: offer.resourceId!,
      depth: 0,
      disableErrors: true,
    });
    if (
      course?.communityId !== community.id ||
      course.status !== "published" ||
      (!course.isPublic && membership?.status !== "active")
    )
      throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (offer.kind === "event" && !input.preparedEvent)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Register on the event page to answer the organizer’s questions.",
    });
  const [policy] = await database
    .select()
    .from(paymentPolicies)
    .where(eq(paymentPolicies.communityId, community.id));
  const [originalConnection] = await database
    .select()
    .from(paymentConnections)
    .where(
      and(
        eq(paymentConnections.id, offer.connectionId),
        isNull(paymentConnections.disconnectedAt),
      ),
    );
  if (
    !originalConnection ||
    policy?.activeConnectionId !== originalConnection.id ||
    !providerAvailable(originalConnection.provider)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Payment setup is incomplete.",
    });
  const connection = await refreshConnection(database, originalConnection);
  const financialOwner = await paymentMembership(
    database,
    community.id,
    connection.ownerId,
  );
  if (financialOwner?.role !== "owner" || financialOwner.status !== "active")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Financial account authority needs to be updated.",
    });
  if (
    !connection.chargesEnabled ||
    !connection.accountId ||
    (connection.provider === "adyen" &&
      (!connection.balanceAccountId || !connection.storeId))
  )
    throw new TRPCError({ code: "PRECONDITION_FAILED" });
  const amount =
    offer.kind === "donation" && offer.interval === "once"
      ? (input.amount ?? offer.amount)
      : offer.amount;
  if (!Number.isInteger(amount) || amount < 100 || amount > 1_000_000)
    throw new TRPCError({ code: "BAD_REQUEST" });
  const order = await database.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.buyerId ?? input.email}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.requestKey, input.requestKey));
    if (existing) {
      if (
        existing.buyerId !== input.buyerId ||
        existing.buyerEmail !== input.email ||
        existing.offerId !== offer.id ||
        existing.amount !== amount
      )
        throw new TRPCError({ code: "CONFLICT" });
      return existing;
    }
    if (input.buyerId) {
      const [pending] = await tx
        .select()
        .from(paymentOrders)
        .where(
          and(
            eq(paymentOrders.buyerId, input.buyerId),
            eq(paymentOrders.offerId, offer.id),
            eq(paymentOrders.amount, amount),
            eq(paymentOrders.status, "pending"),
            gt(paymentOrders.reservationUntil, new Date()),
          ),
        )
        .limit(1);
      if (pending) return pending;
    }
    if (input.buyerId && offer.kind === "membership") {
      const [subscription] = await tx
        .select()
        .from(paymentSubscriptions)
        .innerJoin(
          paymentOrders,
          eq(paymentOrders.id, paymentSubscriptions.orderId),
        )
        .where(
          and(
            eq(paymentSubscriptions.userId, input.buyerId),
            eq(paymentSubscriptions.communityId, community.id),
            eq(paymentOrders.kind, "membership"),
            inArray(paymentSubscriptions.status, [
              "pending",
              "active",
              "past_due",
            ]),
          ),
        )
        .limit(1);
      if (subscription)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Manage your existing membership subscription.",
        });
      if (!membership)
        await tx
          .insert(communityMemberships)
          .values({
            communityId: community.id,
            userId: input.buyerId,
            status: "invited",
          })
          .onConflictDoNothing();
    }
    if (input.buyerId && (offer.kind === "event" || offer.kind === "course")) {
      const [owned] = await tx
        .select()
        .from(paymentOrders)
        .where(
          and(
            eq(paymentOrders.buyerId, input.buyerId),
            eq(paymentOrders.communityId, community.id),
            eq(paymentOrders.kind, offer.kind),
            offer.resourceId
              ? eq(paymentOrders.resourceId, offer.resourceId)
              : sql`true`,
            inArray(paymentOrders.status, ["paid", "refund_pending"]),
          ),
        );
      if (owned)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This purchase is already on your account.",
        });
    }
    if (offer.kind === "event") {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${"event-payment-" + offer.resourceId}, 0))`,
      );
      const [{ count: registered } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, offer.resourceId!),
            inArray(eventRegistrations.status, ["registered", "attended"]),
          ),
        );
      const [{ count: reserved } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentOrders)
        .where(
          and(
            eq(paymentOrders.kind, "event"),
            eq(paymentOrders.resourceId, offer.resourceId!),
            eq(paymentOrders.status, "pending"),
            gt(paymentOrders.reservationUntil, new Date()),
          ),
        );
      const max = input.preparedEvent!.maxAttendees;
      if (max !== null && Number(registered) + Number(reserved) >= max)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This event is full.",
        });
    }
    const [created] = await tx
      .insert(paymentOrders)
      .values({
        ...offer,
        id: crypto.randomUUID(),
        offerId: offer.id,
        amount,
        buyerId: input.buyerId,
        buyerEmail: input.email,
        checkoutLocale: input.locale,
        status: "pending",
        fulfillment: "pending",
        requestKey: input.requestKey,
        reservationUntil: new Date(Date.now() + 30 * 60000),
        createdAt: new Date(),
      })
      .returning();
    if (offer.interval !== "once")
      await tx.insert(paymentSubscriptions).values({
        orderId: created!.id,
        communityId: community.id,
        connectionId: connection.id,
        userId: input.buyerId,
      });
    if (offer.kind === "event") {
      const registrationValues = {
        eventId: offer.resourceId!,
        userId: input.buyerId!,
        status: "pending_payment" as const,
        paymentId: created!.id,
        paymentStatus: "pending",
        answers: input.preparedEvent!.answers,
        organizerNoticeAt: new Date(),
      };
      if (input.preparedEvent!.registrationId) {
        const updated = await tx
          .update(eventRegistrations)
          .set(registrationValues)
          .where(
            and(
              eq(eventRegistrations.id, input.preparedEvent!.registrationId),
              eq(eventRegistrations.userId, input.buyerId!),
              eq(eventRegistrations.status, "waitlisted"),
            ),
          )
          .returning();
        if (!updated.length) throw new TRPCError({ code: "CONFLICT" });
      } else await tx.insert(eventRegistrations).values(registrationValues);
    }
    return created!;
  });
  if (
    order.checkoutUrl &&
    order.status === "pending" &&
    order.reservationUntil &&
    order.reservationUntil > new Date()
  )
    return { orderId: order.id, url: order.checkoutUrl };
  if (
    order.status !== "pending" ||
    !order.reservationUntil ||
    order.reservationUntil <= new Date()
  )
    throw new TRPCError({ code: "CONFLICT", message: "Start a new checkout." });
  const returnUrl = `${paymentAppUrl()}/${order.checkoutLocale}/communities/${encodeURIComponent(community.slug)}/offers/${offer.id}?order=${order.id}`;
  const result =
    connection.provider === "stripe"
      ? await stripeCheckout(connection.accountId, { ...order, returnUrl })
      : await adyenCheckout(connection.balanceAccountId!, connection.storeId!, {
          ...order,
          returnUrl,
        });
  if (!result.url)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Checkout could not be opened.",
    });
  await database
    .update(paymentOrders)
    .set({ checkoutReference: result.id, checkoutUrl: result.url })
    .where(eq(paymentOrders.id, order.id));
  return { orderId: order.id, url: result.url };
}

function originalAdyenRecurringUnavailable() {
  return !process.env.ADYEN_TOKEN_HMAC_KEY;
}

export async function assertSellableResource(
  communityId: string,
  kind: "event" | "course",
  resourceId: number,
) {
  const payload = await getPayloadClient();
  if (kind === "event") {
    const event = await payload.findByID({
      collection: "events",
      id: resourceId,
      depth: 0,
      disableErrors: true,
    });
    if (
      event?.communityId !== communityId ||
      event.status !== "published" ||
      externalEventUrl(event)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a published event hosted here by this community.",
      });
  } else {
    const course = await payload.findByID({
      collection: "courses",
      id: resourceId,
      depth: 0,
      disableErrors: true,
    });
    if (course?.communityId !== communityId || course.status !== "published")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose a published course in this community.",
      });
  }
}
