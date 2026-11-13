import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  communityProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  paymentComplimentaryMembers,
  paymentConnections,
  paymentOffers,
  paymentOrders,
  paymentPolicies,
  paymentRefunds,
  paymentSubscriptions,
  user,
} from "@/server/db/schema";
import {
  offerInputSchema,
  paymentProviderSchema,
  type PaymentsSnapshot,
} from "@/lib/payments";
import {
  connectProvider,
  ownedConnection,
  refreshConnection,
  selectConnection,
  summarizeConnection,
} from "@/server/payments/connections";
import {
  assertSellableResource,
  startCheckout,
} from "@/server/payments/checkout";
import { paymentMembership, paymentsEnabled } from "@/server/payments/access";
import {
  cancelPaymentSubscription,
  refundPayment,
} from "@/server/payments/management";
import { getPayloadClient } from "@/server/payload";
import {
  stripePortal,
  stripePortalConfiguration,
} from "@/server/payments/providers/stripe";
import { paymentAppUrl } from "@/server/payments/providers/http";
import { checkRateLimit } from "@/server/agent/rate-limit";
import { recoverAdyenSubscription } from "@/server/payments/billing-scheduler";
import { loadPaymentFinance } from "@/server/payments/finance";

const slugInput = z.object({ slug: z.string().min(1).max(255) });
const ownerProcedure = communityProcedure.use(({ ctx, next }) => {
  if (ctx.communityRole !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

export const communityPaymentsRouter = createTRPCRouter({
  finance: ownerProcedure.input(slugInput).query(async ({ ctx }) => {
    const [policy] = await ctx.db
      .select()
      .from(paymentPolicies)
      .where(eq(paymentPolicies.communityId, ctx.community.id));
    if (!policy?.activeConnectionId) return null;
    const [connection] = await ctx.db
      .select()
      .from(paymentConnections)
      .where(
        and(
          eq(paymentConnections.id, policy.activeConnectionId),
          eq(paymentConnections.communityId, ctx.community.id),
          eq(paymentConnections.ownerId, ctx.session.user.id),
          isNull(paymentConnections.disconnectedAt),
        ),
      );
    if (!connection?.accountId) throw new TRPCError({ code: "FORBIDDEN" });
    return loadPaymentFinance(connection);
  }),
  overview: ownerProcedure
    .input(slugInput)
    .query(async ({ ctx }): Promise<PaymentsSnapshot> => {
      if (!paymentsEnabled())
        return {
          providers: [
            summarizeConnection("stripe"),
            summarizeConnection("adyen"),
          ],
          activeProvider: null,
          offers: [],
          transactions: [],
          subscriptions: [],
          resources: [],
          paidEntry: false,
          complimentaryMembers: [],
        };
      const communityId = ctx.community.id;
      const [connections, policyRows, offers, orders, subscriptionRows] =
        await Promise.all([
          ctx.db
            .select()
            .from(paymentConnections)
            .where(
              and(
                eq(paymentConnections.communityId, communityId),
                isNull(paymentConnections.disconnectedAt),
              ),
            ),
          ctx.db
            .select()
            .from(paymentPolicies)
            .where(eq(paymentPolicies.communityId, communityId)),
          ctx.db
            .select()
            .from(paymentOffers)
            .where(eq(paymentOffers.communityId, communityId))
            .orderBy(desc(paymentOffers.createdAt)),
          ctx.db
            .select()
            .from(paymentOrders)
            .where(eq(paymentOrders.communityId, communityId))
            .orderBy(desc(paymentOrders.createdAt))
            .limit(100),
          ctx.db
            .select({
              subscription: paymentSubscriptions,
              order: paymentOrders,
              provider: paymentConnections.provider,
            })
            .from(paymentSubscriptions)
            .innerJoin(
              paymentOrders,
              eq(paymentOrders.id, paymentSubscriptions.orderId),
            )
            .innerJoin(
              paymentConnections,
              eq(paymentConnections.id, paymentSubscriptions.connectionId),
            )
            .where(eq(paymentSubscriptions.communityId, communityId))
            .limit(100),
        ]);
      const policy = policyRows[0];
      const complimentaryMembers = !policy?.paidEntryAt
        ? await ctx.db
            .select({ name: user.name, email: user.email })
            .from(communityMemberships)
            .innerJoin(user, eq(user.id, communityMemberships.userId))
            .where(
              and(
                eq(communityMemberships.communityId, communityId),
                eq(communityMemberships.status, "active"),
              ),
            )
            .limit(100)
        : await ctx.db
            .select({ name: user.name, email: user.email })
            .from(paymentComplimentaryMembers)
            .innerJoin(user, eq(user.id, paymentComplimentaryMembers.userId))
            .innerJoin(
              communityMemberships,
              and(
                eq(
                  communityMemberships.communityId,
                  paymentComplimentaryMembers.communityId,
                ),
                eq(
                  communityMemberships.userId,
                  paymentComplimentaryMembers.userId,
                ),
              ),
            )
            .where(
              and(
                eq(paymentComplimentaryMembers.communityId, communityId),
                eq(communityMemberships.status, "active"),
              ),
            )
            .limit(100);
      const refunds = orders.length
        ? await ctx.db
            .select({
              orderId: paymentRefunds.orderId,
              amount: sql<number>`sum(${paymentRefunds.amount})::int`,
            })
            .from(paymentRefunds)
            .where(
              and(
                inArray(
                  paymentRefunds.orderId,
                  orders.map((order) => order.id),
                ),
                eq(paymentRefunds.status, "succeeded"),
              ),
            )
            .groupBy(paymentRefunds.orderId)
        : [];
      const allConnections = await ctx.db
        .select()
        .from(paymentConnections)
        .where(eq(paymentConnections.communityId, communityId));
      const [events, courses] = await Promise.all([
        (await getPayloadClient()).find({
          collection: "events",
          where: {
            and: [
              { communityId: { equals: communityId } },
              { status: { equals: "published" } },
            ],
          },
          limit: 100,
          depth: 0,
        }),
        (await getPayloadClient()).find({
          collection: "courses",
          where: {
            and: [
              { communityId: { equals: communityId } },
              { status: { equals: "published" } },
            ],
          },
          limit: 100,
          depth: 0,
        }),
      ]);
      return {
        providers: (["stripe", "adyen"] as const).map((provider) =>
          summarizeConnection(
            provider,
            connections.find(
              (connection) =>
                connection.provider === provider &&
                connection.ownerId === ctx.session.user.id,
            ),
          ),
        ),
        activeProvider:
          connections.find(
            (connection) =>
              connection.id === policy?.activeConnectionId &&
              connection.ownerId === ctx.session.user.id,
          )?.provider ?? null,
        offers: offers.map((offer) => ({
          ...offer,
          provider: allConnections.find(
            (connection) => connection.id === offer.connectionId,
          )!.provider,
          currency: "EUR",
          editable: !offer.publishedAt,
        })),
        transactions: orders.map((order) => ({
          ...order,
          refundedAmount:
            refunds.find((refund) => refund.orderId === order.id)?.amount ?? 0,
        })),
        subscriptions: subscriptionRows.map(
          ({ subscription, order, provider }) => ({
            ...subscription,
            title: order.title,
            kind: order.kind,
            buyerEmail: order.buyerEmail,
            provider,
          }),
        ),
        resources: [
          ...events.docs.map((event) => ({
            id: event.id,
            title: event.title,
            kind: "event" as const,
          })),
          ...courses.docs.map((course) => ({
            id: course.id,
            title: course.title,
            kind: "course" as const,
          })),
        ],
        paidEntry: !!policy?.paidEntryAt,
        complimentaryMembers,
      };
    }),
  connect: ownerProcedure
    .input(
      slugInput.extend({
        provider: paymentProviderSchema,
        country: z.enum(["NL", "BE", "DE", "FR", "GB", "IE", "ES", "IT", "US"]),
        entityType: z.enum(["individual", "organization"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      connectProvider(ctx.db, {
        ...input,
        communityId: ctx.community.id,
        ownerId: ctx.session.user.id,
        name: ctx.community.name,
      }),
    ),
  refresh: ownerProcedure.input(slugInput).mutation(async ({ ctx }) => {
    for (const provider of ["stripe", "adyen"] as const) {
      const connection = await ownedConnection(
        ctx.db,
        ctx.community.id,
        ctx.session.user.id,
        provider,
      );
      if (connection?.accountId) await refreshConnection(ctx.db, connection);
    }
    return { ok: true };
  }),
  selectProvider: ownerProcedure
    .input(slugInput.extend({ provider: paymentProviderSchema }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ownedConnection(
        ctx.db,
        ctx.community.id,
        ctx.session.user.id,
        input.provider,
      );
      if (!connection) throw new TRPCError({ code: "NOT_FOUND" });
      await selectConnection(
        ctx.db,
        await refreshConnection(ctx.db, connection),
      );
      return { ok: true };
    }),
  createOffer: ownerProcedure
    .input(slugInput.extend({ offer: offerInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const [policy] = await ctx.db
        .select()
        .from(paymentPolicies)
        .where(eq(paymentPolicies.communityId, ctx.community.id));
      if (!paymentsEnabled() || !policy?.activeConnectionId)
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      const [connection] = await ctx.db
        .select()
        .from(paymentConnections)
        .where(
          and(
            eq(paymentConnections.id, policy.activeConnectionId),
            eq(paymentConnections.ownerId, ctx.session.user.id),
            isNull(paymentConnections.disconnectedAt),
          ),
        );
      if (!connection) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.offer.kind === "event" || input.offer.kind === "course")
        await assertSellableResource(
          ctx.community.id,
          input.offer.kind,
          input.offer.resourceId!,
        );
      const [offer] = await ctx.db
        .insert(paymentOffers)
        .values({
          ...input.offer,
          communityId: ctx.community.id,
          connectionId: connection.id,
        })
        .returning({ id: paymentOffers.id });
      return offer!;
    }),
  updateOffer: ownerProcedure
    .input(
      slugInput.extend({ offerId: z.string().uuid(), offer: offerInputSchema }),
    )
    .mutation(async ({ ctx, input }) => {
      const [offer] = await ctx.db
        .select()
        .from(paymentOffers)
        .where(
          and(
            eq(paymentOffers.id, input.offerId),
            eq(paymentOffers.communityId, ctx.community.id),
          ),
        );
      if (!offer) throw new TRPCError({ code: "NOT_FOUND" });
      if (offer.publishedAt)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Create a new offer to change published terms.",
        });
      if (input.offer.kind === "event" || input.offer.kind === "course")
        await assertSellableResource(
          ctx.community.id,
          input.offer.kind,
          input.offer.resourceId!,
        );
      await ctx.db
        .update(paymentOffers)
        .set(input.offer)
        .where(
          and(
            eq(paymentOffers.id, offer.id),
            isNull(paymentOffers.publishedAt),
          ),
        );
      return { ok: true };
    }),
  publishOffer: ownerProcedure
    .input(
      slugInput.extend({ offerId: z.string().uuid(), published: z.boolean() }),
    )
    .mutation(async ({ ctx, input }) => {
      const [offer] = await ctx.db
        .select()
        .from(paymentOffers)
        .where(
          and(
            eq(paymentOffers.id, input.offerId),
            eq(paymentOffers.communityId, ctx.community.id),
          ),
        );
      if (!offer) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.published) {
        const [policy] = await ctx.db
          .select()
          .from(paymentPolicies)
          .where(eq(paymentPolicies.communityId, ctx.community.id));
        if (policy?.activeConnectionId !== offer.connectionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Copy this offer to the selected provider before publishing.",
          });
        const [connection] = await ctx.db
          .select()
          .from(paymentConnections)
          .where(
            and(
              eq(paymentConnections.id, offer.connectionId),
              eq(paymentConnections.ownerId, ctx.session.user.id),
              isNull(paymentConnections.disconnectedAt),
            ),
          );
        if (
          !connection ||
          !(await refreshConnection(ctx.db, connection)).chargesEnabled
        )
          throw new TRPCError({ code: "PRECONDITION_FAILED" });
        if (offer.kind === "course" || offer.kind === "event")
          await assertSellableResource(
            ctx.community.id,
            offer.kind,
            offer.resourceId!,
          );
      }
      await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.community.id}, 0))`,
        );
        if (
          input.published &&
          (offer.kind === "event" || offer.kind === "course")
        )
          await tx
            .update(paymentOffers)
            .set({ published: false })
            .where(
              and(
                eq(paymentOffers.communityId, ctx.community.id),
                eq(paymentOffers.kind, offer.kind),
                eq(paymentOffers.resourceId, offer.resourceId!),
              ),
            );
        await tx
          .update(paymentOffers)
          .set({
            published: input.published,
            ...(input.published
              ? { publishedAt: offer.publishedAt ?? new Date() }
              : {}),
          })
          .where(eq(paymentOffers.id, offer.id));
      });
      if (input.published && offer.kind === "event")
        await (
          await getPayloadClient()
        ).update({
          collection: "events",
          id: offer.resourceId!,
          data: { price: offer.amount },
        });
      return { ok: true };
    }),
  paidEntry: ownerProcedure
    .input(slugInput.extend({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.community.slug === "ait")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The shared Hub remains free.",
        });
      await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.community.id}, 0))`,
        );
        const [policy] = await tx
          .select()
          .from(paymentPolicies)
          .where(eq(paymentPolicies.communityId, ctx.community.id));
        if (input.enabled) {
          if (!policy?.activeConnectionId)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Select a payment provider first.",
            });
          const [offer] = await tx
            .select()
            .from(paymentOffers)
            .where(
              and(
                eq(paymentOffers.communityId, ctx.community.id),
                eq(paymentOffers.kind, "membership"),
                eq(paymentOffers.published, true),
                eq(paymentOffers.connectionId, policy.activeConnectionId),
              ),
            )
            .limit(1);
          if (!offer) throw new TRPCError({ code: "PRECONDITION_FAILED" });
          if (!policy?.paidEntryAt) {
            const existing = await tx
              .select({
                communityId: communityMemberships.communityId,
                userId: communityMemberships.userId,
              })
              .from(communityMemberships)
              .where(
                and(
                  eq(communityMemberships.communityId, ctx.community.id),
                  eq(communityMemberships.status, "active"),
                ),
              );
            if (existing.length)
              await tx
                .insert(paymentComplimentaryMembers)
                .values(existing)
                .onConflictDoNothing();
          }
        }
        await tx
          .update(paymentPolicies)
          .set({
            paidEntryAt: input.enabled
              ? (policy?.paidEntryAt ?? new Date())
              : null,
          })
          .where(eq(paymentPolicies.communityId, ctx.community.id));
      });
      return { ok: true };
    }),
  refund: ownerProcedure
    .input(slugInput.extend({ orderId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      refundPayment(
        ctx.db,
        ctx.community.id,
        ctx.session.user.id,
        input.orderId,
      ),
    ),
  cancel: protectedProcedure
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      cancelPaymentSubscription(
        ctx.db,
        ctx.session.user.id,
        input.subscriptionId,
      ),
    ),
  recover: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string().uuid(),
        locale: z.enum(["en", "nl", "fr"]).default("en"),
        consent: z.literal(true),
      }),
    )
    .mutation(({ ctx, input }) =>
      recoverAdyenSubscription(
        ctx.db,
        ctx.session.user.id,
        input.subscriptionId,
        input.locale,
      ),
    ),
  publicOffers: publicProcedure
    .input(slugInput)
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });
      if (!paymentsEnabled())
        return {
          name: community.name,
          offers: [],
          admitted: false,
          hasMembershipSubscription: false,
        };
      const membership = ctx.session?.user
        ? await paymentMembership(ctx.db, community.id, ctx.session.user.id)
        : null;
      if (
        membership?.status === "banned" ||
        (community.joinPolicy === "invite_only" &&
          !["active", "invited"].includes(membership?.status ?? ""))
      )
        throw new TRPCError({ code: "NOT_FOUND" });
      const [policy] = await ctx.db
        .select()
        .from(paymentPolicies)
        .where(eq(paymentPolicies.communityId, community.id));
      const [subscription] = ctx.session?.user
        ? await ctx.db
            .select({ id: paymentSubscriptions.id })
            .from(paymentSubscriptions)
            .innerJoin(
              paymentOrders,
              eq(paymentOrders.id, paymentSubscriptions.orderId),
            )
            .where(
              and(
                eq(paymentSubscriptions.communityId, community.id),
                eq(paymentSubscriptions.userId, ctx.session.user.id),
                eq(paymentOrders.kind, "membership"),
                inArray(paymentSubscriptions.status, [
                  "pending",
                  "active",
                  "past_due",
                ]),
              ),
            )
            .limit(1)
        : [];
      const hasMembershipSubscription = !!subscription;
      if (!policy?.activeConnectionId)
        return {
          name: community.name,
          offers: [],
          admitted:
            community.joinPolicy === "open" ||
            membership?.status === "active" ||
            membership?.status === "invited",
          hasMembershipSubscription,
        };
      const offers = await ctx.db
        .select()
        .from(paymentOffers)
        .where(
          and(
            eq(paymentOffers.communityId, community.id),
            eq(paymentOffers.connectionId, policy.activeConnectionId),
            membership?.role === "owner" && membership.status === "active"
              ? sql`true`
              : eq(paymentOffers.published, true),
          ),
        );
      const eventIds = offers
        .filter((offer) => offer.kind === "event")
        .map((offer) => offer.resourceId!);
      const events = eventIds.length
        ? await (
            await getPayloadClient()
          ).find({
            collection: "events",
            where: { id: { in: eventIds } },
            limit: 100,
            depth: 0,
          })
        : { docs: [] };
      const courseIds = offers
        .filter((offer) => offer.kind === "course")
        .map((offer) => offer.resourceId!);
      const courses = courseIds.length
        ? await (
            await getPayloadClient()
          ).find({
            collection: "courses",
            where: { id: { in: courseIds } },
            limit: 100,
            depth: 0,
          })
        : { docs: [] };
      return {
        name: community.name,
        offers: offers.map((offer) => ({
          ...offer,
          eventSlug:
            offer.kind === "event"
              ? (events.docs.find((event) => event.id === offer.resourceId)
                  ?.slug ?? null)
              : null,
          courseSlug:
            offer.kind === "course"
              ? (courses.docs.find((course) => course.id === offer.resourceId)
                  ?.slug ?? null)
              : null,
        })),
        admitted:
          community.joinPolicy === "open" ||
          membership?.status === "active" ||
          membership?.status === "invited",
        hasMembershipSubscription,
      };
    }),
  checkout: publicProcedure
    .input(
      z.object({
        offerId: z.string().uuid(),
        email: z.string().email().max(254),
        requestKey: z.string().uuid(),
        amount: z.number().int().min(100).max(1_000_000).optional(),
        consent: z.boolean().default(false),
        locale: z.enum(["en", "nl", "fr"]).default("en"),
      }),
    )
    .mutation(({ ctx, input }) => {
      const key =
        ctx.session?.user.id ??
        ctx.headers.get("x-forwarded-for")?.split(",")[0] ??
        "anonymous";
      if (!checkRateLimit(`payment-checkout:${key}`).allowed)
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      return startCheckout(ctx.db, {
        ...input,
        email: ctx.session?.user.email ?? input.email,
        buyerId: ctx.session?.user.id ?? null,
      });
    }),
  orderStatus: publicProcedure
    .input(z.object({ orderId: z.string().uuid(), offerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select({
          status: paymentOrders.status,
          fulfillment: paymentOrders.fulfillment,
        })
        .from(paymentOrders)
        .where(
          and(
            eq(paymentOrders.id, input.orderId),
            eq(paymentOrders.offerId, input.offerId),
          ),
        );
      return order ?? null;
    }),
  mine: protectedProcedure.query(async ({ ctx }) => {
    if (!paymentsEnabled())
      return { orders: [], subscriptions: [], complimentaryCommunities: [] };
    const complimentaryCommunities = await ctx.db
      .select({ name: communities.name, slug: communities.slug })
      .from(paymentComplimentaryMembers)
      .innerJoin(
        communities,
        eq(communities.id, paymentComplimentaryMembers.communityId),
      )
      .innerJoin(
        paymentPolicies,
        eq(paymentPolicies.communityId, communities.id),
      )
      .innerJoin(
        communityMemberships,
        and(
          eq(communityMemberships.communityId, communities.id),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      )
      .where(
        and(
          eq(paymentComplimentaryMembers.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
          sql`${paymentPolicies.paidEntryAt} IS NOT NULL`,
        ),
      );
    const orders = await ctx.db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.buyerId, ctx.session.user.id))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(100);
    const subscriptions = await ctx.db
      .select({
        subscription: paymentSubscriptions,
        order: paymentOrders,
        provider: paymentConnections.provider,
      })
      .from(paymentSubscriptions)
      .innerJoin(
        paymentOrders,
        eq(paymentOrders.id, paymentSubscriptions.orderId),
      )
      .innerJoin(
        paymentConnections,
        eq(paymentConnections.id, paymentSubscriptions.connectionId),
      )
      .where(eq(paymentSubscriptions.userId, ctx.session.user.id));
    return {
      orders: orders.map(
        ({
          id,
          title,
          kind,
          amount,
          currency,
          status,
          receiptUrl,
          createdAt,
        }) => ({
          id,
          title,
          kind,
          amount,
          currency,
          status,
          receiptUrl:
            receiptUrl ??
            (["paid", "refund_pending", "refunded"].includes(status)
              ? `/api/payments/receipt/${id}`
              : null),
          createdAt,
        }),
      ),
      complimentaryCommunities,
      subscriptions: subscriptions.map(({ subscription, order, provider }) => ({
        id: subscription.id,
        status: subscription.status,
        paidThrough: subscription.paidThrough,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        title: order.title,
        kind: order.kind,
        provider,
      })),
    };
  }),
  portal: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string().uuid(),
        locale: z.enum(["en", "nl", "fr"]).default("en"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          subscription: paymentSubscriptions,
          connection: paymentConnections,
        })
        .from(paymentSubscriptions)
        .innerJoin(
          paymentConnections,
          eq(paymentConnections.id, paymentSubscriptions.connectionId),
        )
        .where(
          and(
            eq(paymentSubscriptions.id, input.subscriptionId),
            eq(paymentSubscriptions.userId, ctx.session.user.id),
          ),
        );
      if (
        row?.connection.provider !== "stripe" ||
        !row.connection.accountId ||
        !row.subscription.customerReference
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payment-method updates require a new checkout.",
        });
      let configurationId = row.connection.portalConfigurationId;
      if (!configurationId) {
        configurationId = (
          await stripePortalConfiguration(row.connection.accountId)
        ).id;
        await ctx.db
          .update(paymentConnections)
          .set({ portalConfigurationId: configurationId })
          .where(eq(paymentConnections.id, row.connection.id));
      }
      return stripePortal(
        row.connection.accountId,
        row.subscription.customerReference,
        `${paymentAppUrl()}/${input.locale}/dashboard/payments`,
        configurationId,
      );
    }),
});
