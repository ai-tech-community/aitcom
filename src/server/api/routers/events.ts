import { z } from "zod";
import { eq, and, isNull, sql, asc } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  eventRegistrations,
  memberProfiles,
  user,
  communities,
  communityMemberships,
  communityLumaIntegrations,
} from "@/server/db/schema";
import { decryptApiKey } from "@/server/luma/crypto";
import { getCalendarEvents } from "@/server/luma/client";
import { getCached, setCached } from "@/server/luma/cache";
import { normalizeLumaEvent } from "@/server/luma/normalize";
import type { NormalizedEvent } from "@/server/luma/normalize";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import {
  sendRegistrationConfirmation,
  sendCancellationConfirmation,
  sendWaitlistPromotion,
} from "@/server/email";
import { getMollie } from "@/server/mollie";
import { env } from "@/env";
import { TRPCError } from "@trpc/server";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

async function getEventEmailData(eventId: number) {
  const payload = await getPayloadClient();
  const event = await payload.findByID({ collection: "events", id: eventId });
  return {
    eventTitle: event.title,
    eventDate: formatDate(event.date),
    eventLocation: event.location,
    eventSlug: event.slug,
  };
}

function getAppUrl(): string {
  return env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const eventsRouter = createTRPCRouter({
  /**
   * Register the current user for an event.
   * - Free events: register immediately
   * - Paid events: create Mollie payment, return checkout URL
   * - Full events: waitlist
   */
  register: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is already registered (not cancelled/payment_failed)
      const existing = await ctx.db
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            eq(eventRegistrations.userId, userId),
            sql`${eventRegistrations.status} NOT IN ('cancelled', 'payment_failed')`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          registration: existing[0]!,
          alreadyRegistered: true,
          checkoutUrl: null,
        };
      }

      // Fetch event from server for capacity and price check
      const payload = await getPayloadClient();
      const event = await payload.findByID({
        collection: "events",
        id: input.eventId,
      });

      // Count current active registrations for capacity check
      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            sql`${eventRegistrations.status} IN ('registered', 'attended')`,
          ),
        );

      const currentCount = countResult?.count ?? 0;
      const maxAttendees = (event.maxAttendees as number | undefined) ?? null;
      const isFull = maxAttendees !== null && currentCount >= maxAttendees;

      const price = (event.price as number | undefined) ?? 0;
      const isPaid = price > 0;
      const mollie = getMollie();

      // Paid event with Mollie configured
      if (isPaid && mollie && !isFull) {
        const appUrl = getAppUrl();
        const molliePayment = await mollie.payments.create({
          amount: {
            currency: "EUR",
            value: (price / 100).toFixed(2),
          },
          description: `AIT: ${event.title}`,
          redirectUrl: `${appUrl}/events/${event.slug}/payment`,
          webhookUrl: `${appUrl}/api/mollie/webhook`,
          metadata: {
            eventId: String(input.eventId),
            userId,
          },
        });

        const [registration] = await ctx.db
          .insert(eventRegistrations)
          .values({
            eventId: input.eventId,
            userId,
            status: "pending_payment",
            paymentId: molliePayment.id,
            paymentStatus: molliePayment.status,
          })
          .returning();

        return {
          registration: registration!,
          alreadyRegistered: false,
          checkoutUrl: molliePayment._links.checkout?.href ?? null,
        };
      }

      // Free event or no Mollie configured
      const status = isFull ? "waitlisted" : "registered";

      const [registration] = await ctx.db
        .insert(eventRegistrations)
        .values({
          eventId: input.eventId,
          userId,
          status,
        })
        .returning();

      // Award XP for registration (only if user has a profile)
      if (status === "registered") {
        const [profile] = await ctx.db
          .select()
          .from(memberProfiles)
          .where(eq(memberProfiles.userId, userId))
          .limit(1);

        if (profile) {
          await awardXp(ctx.db, userId, XP_AMOUNTS.REGISTER_EVENT);
        }

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "event.register",
          targetType: "event",
          targetId: String(input.eventId),
          metadata: { eventTitle: event.title },
        });
      }

      // Send confirmation email (async, don't block response)
      void (async () => {
        try {
          const eventData = await getEventEmailData(input.eventId);
          const userName = ctx.session.user.name ?? "there";
          const email = ctx.session.user.email;
          if (email) {
            await sendRegistrationConfirmation(email, userName, eventData);
          }
        } catch (e) {
          console.error("Failed to send registration email:", e);
        }
      })();

      return {
        registration: registration!,
        alreadyRegistered: false,
        checkoutUrl: null,
      };
    }),

  /**
   * Cancel the current user's registration for an event.
   * If event was at capacity, promote the next waitlisted user.
   */
  cancelRegistration: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db
        .update(eventRegistrations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            eq(eventRegistrations.userId, userId),
            sql`${eventRegistrations.status} NOT IN ('cancelled', 'payment_failed')`,
          ),
        );

      // Promote next waitlisted user (if any)
      const [nextWaitlisted] = await ctx.db
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            eq(eventRegistrations.status, "waitlisted"),
          ),
        )
        .orderBy(asc(eventRegistrations.registeredAt))
        .limit(1);

      if (nextWaitlisted) {
        await ctx.db
          .update(eventRegistrations)
          .set({ status: "registered" })
          .where(eq(eventRegistrations.id, nextWaitlisted.id));

        // Email the promoted user
        void (async () => {
          try {
            const eventData = await getEventEmailData(input.eventId);
            const [promotedUser] = await ctx.db
              .select({ name: user.name, email: user.email })
              .from(user)
              .where(eq(user.id, nextWaitlisted.userId))
              .limit(1);
            if (promotedUser?.email) {
              await sendWaitlistPromotion(
                promotedUser.email,
                promotedUser.name ?? "there",
                eventData,
              );
            }
          } catch (e) {
            console.error("Failed to send waitlist promotion email:", e);
          }
        })();
      }

      // Send cancellation email to the user (async)
      void (async () => {
        try {
          const eventData = await getEventEmailData(input.eventId);
          const userName = ctx.session.user.name ?? "there";
          const email = ctx.session.user.email;
          if (email) {
            await sendCancellationConfirmation(email, userName, eventData);
          }
        } catch (e) {
          console.error("Failed to send cancellation email:", e);
        }
      })();

      return { success: true };
    }),

  /**
   * Get all active (non-cancelled) registrations for the current user.
   */
  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const registrations = await ctx.db
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.userId, userId),
          sql`${eventRegistrations.status} NOT IN ('cancelled', 'payment_failed')`,
        ),
      );

    return registrations;
  }),

  /**
   * Get the registration status for the current user on a specific event.
   */
  registrationStatus: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [registration] = await ctx.db
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            eq(eventRegistrations.userId, userId),
            sql`${eventRegistrations.status} NOT IN ('cancelled', 'payment_failed')`,
          ),
        )
        .limit(1);

      return registration ?? null;
    }),

  /**
   * Get the count of active registrations for an event (for capacity bar).
   */
  registrationCount: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            sql`${eventRegistrations.status} IN ('registered', 'attended')`,
          ),
        );

      return result?.count ?? 0;
    }),

  /**
   * Get registered attendees for an event (public, for the attendee list).
   */
  getAttendees: publicProcedure
    .input(z.object({ eventId: z.number(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          userId: user.id,
          name: user.name,
          image: user.image,
          displayName: memberProfiles.displayName,
        })
        .from(eventRegistrations)
        .innerJoin(user, eq(eventRegistrations.userId, user.id))
        .leftJoin(
          memberProfiles,
          eq(eventRegistrations.userId, memberProfiles.userId),
        )
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            sql`${eventRegistrations.status} IN ('registered', 'attended')`,
          ),
        )
        .limit(input.limit);

      return rows.map((row) => ({
        userId: row.userId,
        displayName: row.displayName ?? row.name ?? "Anonymous",
        image: row.image,
      }));
    }),

  /**
   * Get published events for a community.
   * Merges native Payload CMS events with Luma events (if integration is active).
   */
  getCommunityEvents: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) return [];

      // 1. Fetch native events from Payload CMS
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { status: { equals: "published" } },
            { communityId: { equals: community.id } },
          ],
        },
        sort: "date",
        draft: false,
      });

      // Normalize native events
      const nativeEvents: NormalizedEvent[] = docs.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        description: null,
        type: e.type,
        date: e.date,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        location: e.location,
        maxAttendees: (e.maxAttendees as number | null) ?? null,
        image: null,
        status: e.status,
        communityId: community.id,
        source: "native" as const,
        lumaUrl: null,
      }));

      // 2. Check for Luma integration
      let lumaEvents: NormalizedEvent[] = [];

      const [integration] = await ctx.db
        .select()
        .from(communityLumaIntegrations)
        .where(
          and(
            eq(communityLumaIntegrations.communityId, community.id),
            eq(communityLumaIntegrations.isEnabled, true),
          ),
        )
        .limit(1);

      if (integration?.calendarApiId) {
        const cacheKey = `luma-events:${community.id}`;
        const cached = getCached<NormalizedEvent[]>(cacheKey);

        if (cached) {
          lumaEvents = cached;
        } else {
          try {
            const apiKey = decryptApiKey(integration.apiKeyEncrypted);
            const rawEvents = await getCalendarEvents(
              apiKey,
              integration.calendarApiId,
            );

            lumaEvents = rawEvents.map((e) =>
              normalizeLumaEvent(e, community.id),
            );
            setCached(cacheKey, lumaEvents);

            // Update lastSyncCheck (fire and forget)
            void ctx.db
              .update(communityLumaIntegrations)
              .set({ lastSyncCheck: new Date() })
              .where(eq(communityLumaIntegrations.id, integration.id));
          } catch (err) {
            console.error("Failed to fetch Luma events:", err);
            // Graceful degradation: return native events only
          }
        }
      }

      // 3. Merge and sort by date ascending
      const allEvents = [...nativeEvents, ...lumaEvents].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return allEvents;
    }),

  /**
   * Create a new event within a community.
   * Only community owners/admins can create events.
   */
  createEvent: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        title: z.string().min(3).max(255),
        description: z.string().max(5000).optional(),
        type: z.enum(["workshop", "hackathon", "deep_dive", "meetup"]),
        date: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().min(1).max(255),
        maxAttendees: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Resolve community and check admin/owner role
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
        ),
      });
      if (
        membership?.status !== "active" ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins can create events",
        });
      }

      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const payload = await getPayloadClient();
      const event = await payload.create({
        collection: "events",
        data: {
          title: input.title,
          slug,
          description: input.description
            ? plainTextToLexical(input.description)
            : plainTextToLexical(""),
          type: input.type,
          date: input.date,
          startTime: input.startTime ?? undefined,
          endTime: input.endTime ?? undefined,
          location: input.location,
          maxAttendees: input.maxAttendees ?? undefined,
          status: "published",
          communityId: community.id,
        },
      });

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.create",
        targetType: "event",
        targetId: String(event.id),
        metadata: { title: input.title, communitySlug: input.communitySlug },
      });

      return event;
    }),

  /** Update an event (admin/owner only) */
  updateEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        communitySlug: z.string(),
        title: z.string().min(3).max(255).optional(),
        description: z.string().max(5000).optional(),
        type: z
          .enum(["workshop", "hackathon", "deep_dive", "meetup"])
          .optional(),
        date: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().min(1).max(255).optional(),
        maxAttendees: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
        ),
      });
      if (
        membership?.status !== "active" ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins can update events",
        });
      }

      const payload = await getPayloadClient();

      // Verify the event actually belongs to this community (prevent cross-community IDOR)
      const existingEvent = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });
      if (
        !existingEvent?.communityId ||
        existingEvent.communityId !== community.id
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined)
        data.description = plainTextToLexical(input.description);
      if (input.type !== undefined) data.type = input.type;
      if (input.date !== undefined) data.date = input.date;
      if (input.startTime !== undefined) data.startTime = input.startTime;
      if (input.endTime !== undefined) data.endTime = input.endTime;
      if (input.location !== undefined) data.location = input.location;
      if (input.maxAttendees !== undefined)
        data.maxAttendees = input.maxAttendees;

      const event = await payload.update({
        collection: "events",
        id: input.eventId,
        data,
      });

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.update",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { title: event.title, communitySlug: input.communitySlug },
      });

      return event;
    }),

  /** Cancel an event and all registrations (admin/owner only) */
  cancelEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        communitySlug: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Community not found",
        });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
        ),
      });
      if (
        membership?.status !== "active" ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins can cancel events",
        });
      }

      // Verify the event belongs to this community (prevent cross-community IDOR)
      const payload = await getPayloadClient();
      const existingEvent = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });
      if (
        !existingEvent?.communityId ||
        existingEvent.communityId !== community.id
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      // Set event status to cancelled
      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "cancelled" },
      });

      // Bulk-cancel all active registrations
      await ctx.db
        .update(eventRegistrations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            sql`${eventRegistrations.status} IN ('registered', 'waitlisted')`,
          ),
        );

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.cancel",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { communitySlug: input.communitySlug },
      });

      return { success: true };
    }),
});
