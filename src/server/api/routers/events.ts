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
  notifications,
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
import {
  plainTextToLexical,
  lexicalToPlainText,
} from "@/server/challenge-engine/lexical";
import {
  eventUpsertSchema,
  normalizeOptionalString,
  buildEventPayloadData,
} from "./event-upsert-data";
import { runEventImport } from "@/server/events/import-from-url";
import { checkEventImportRateLimit } from "@/server/events/import-rate-limit";

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
  register: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

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

      const payload = await getPayloadClient();
      const event = await payload.findByID({
        collection: "events",
        id: input.eventId,
      });

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

      const status = isFull ? "waitlisted" : "registered";

      const [registration] = await ctx.db
        .insert(eventRegistrations)
        .values({
          eventId: input.eventId,
          userId,
          status,
        })
        .returning();

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

  markIntent: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const payload = await getPayloadClient();
      const event = await payload.findByID({
        collection: "events",
        id: input.eventId,
      });

      if (!event.sourceUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Intent only applies to external events.",
        });
      }

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
        return { registration: existing[0]!, alreadyMarked: true };
      }

      const [registration] = await ctx.db
        .insert(eventRegistrations)
        .values({
          eventId: input.eventId,
          userId,
          status: "intent",
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.intent",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { eventTitle: event.title },
      });

      return { registration: registration!, alreadyMarked: false };
    }),

  removeIntent: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db
        .delete(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            eq(eventRegistrations.userId, userId),
            eq(eventRegistrations.status, "intent"),
          ),
        );

      return { success: true };
    }),

  registrationCount: publicProcedure
    .input(
      z.object({
        eventId: z.number(),
        includeIntent: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const statusFilter = input.includeIntent
        ? sql`${eventRegistrations.status} IN ('registered', 'attended', 'intent')`
        : sql`${eventRegistrations.status} IN ('registered', 'attended')`;

      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(
          and(eq(eventRegistrations.eventId, input.eventId), statusFilter),
        );

      return result?.count ?? 0;
    }),

  getAttendees: publicProcedure
    .input(
      z.object({
        eventId: z.number(),
        limit: z.number().default(20),
        includeIntent: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const statusFilter = input.includeIntent
        ? sql`${eventRegistrations.status} IN ('registered', 'attended', 'intent')`
        : sql`${eventRegistrations.status} IN ('registered', 'attended')`;

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
        .where(and(eq(eventRegistrations.eventId, input.eventId), statusFilter))
        .limit(input.limit);

      return rows.map((row) => ({
        userId: row.userId,
        displayName: row.displayName ?? row.name ?? "Anonymous",
        image: row.image,
      }));
    }),

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
        depth: 1,
      });

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
        coverImageId:
          e.coverImage && typeof e.coverImage === "object"
            ? ((e.coverImage as { id: number }).id ?? null)
            : null,
        coverImageUrl:
          e.coverImage && typeof e.coverImage === "object"
            ? ((e.coverImage as { url?: string }).url ?? null)
            : null,
      }));

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

            void ctx.db
              .update(communityLumaIntegrations)
              .set({ lastSyncCheck: new Date() })
              .where(eq(communityLumaIntegrations.id, integration.id));
          } catch (err) {
            console.error("Failed to fetch Luma events:", err);
          }
        }
      }

      const allEvents = [...nativeEvents, ...lumaEvents].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return allEvents;
    }),

  createEvent: protectedProcedure
    .input(
      z.object({ communitySlug: z.string() }).extend(eventUpsertSchema.shape),
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
          slug,
          status: "published",
          communityId: community.id,
          ...buildEventPayloadData(input),
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

  updateEvent: protectedProcedure
    .input(
      z
        .object({
          eventId: z.number(),
          communitySlug: z.string(),
        })
        .merge(eventUpsertSchema.partial()),
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
      if (input.summary !== undefined)
        data.summary = normalizeOptionalString(input.summary);
      if (input.type !== undefined) data.type = input.type;
      if (input.date !== undefined) data.date = input.date;
      if (input.startTime !== undefined)
        data.startTime = normalizeOptionalString(input.startTime);
      if (input.endTime !== undefined)
        data.endTime = normalizeOptionalString(input.endTime);
      if (input.location !== undefined) data.location = input.location;
      if (input.format !== undefined) data.format = input.format;
      if (input.region !== undefined)
        data.region = normalizeOptionalString(input.region);
      if (input.country !== undefined)
        data.country = normalizeOptionalString(input.country);
      if (input.city !== undefined)
        data.city = normalizeOptionalString(input.city);
      if (input.focus !== undefined) data.focus = input.focus;
      if (input.level !== undefined) data.level = input.level;
      if (input.audience !== undefined) data.audience = input.audience;
      if (input.sourceUrl !== undefined)
        data.sourceUrl = normalizeOptionalString(input.sourceUrl);
      if (input.aitFitScore !== undefined) data.aitFitScore = input.aitFitScore;
      if (input.tags !== undefined)
        data.tags = input.tags
          .map((tag) => ({ tag: tag.trim() }))
          .filter((entry) => entry.tag.length > 0);
      if (input.curatedByAgent !== undefined)
        data.curatedByAgent = input.curatedByAgent;
      if (input.discoverySource !== undefined)
        data.discoverySource = normalizeOptionalString(input.discoverySource);
      if (input.confidenceScore !== undefined)
        data.confidenceScore = input.confidenceScore;
      if (input.lastVerifiedAt !== undefined)
        data.lastVerifiedAt = input.lastVerifiedAt
          ? new Date(input.lastVerifiedAt).toISOString()
          : null;
      if (input.videoUrl !== undefined)
        data.videoUrl = normalizeOptionalString(input.videoUrl);
      if (input.maxAttendees !== undefined)
        data.maxAttendees = input.maxAttendees;
      if (input.coverImage !== undefined) data.coverImage = input.coverImage;

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

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "cancelled" },
      });

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

  submitEvent: protectedProcedure
    .input(
      z.object({ communitySlug: z.string() }).extend(eventUpsertSchema.shape),
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
      if (membership?.status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be an active community member to submit events",
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
          slug,
          status: "draft" as const,
          communityId: community.id,
          submittedBy: userId,
          ...buildEventPayloadData(input),
          // Strip curation-only fields that members cannot set
          aitFitScore: undefined,
          curatedByAgent: false,
          confidenceScore: undefined,
          discoverySource: undefined,
          lastVerifiedAt: undefined,
        },
      });

      // Notify all admins/owners/moderators of this community
      const admins = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
            sql`${communityMemberships.role} IN ('owner', 'admin', 'moderator')`,
          ),
        );

      if (admins.length > 0) {
        await ctx.db.insert(notifications).values(
          admins.map(({ userId: adminId }) => ({
            userId: adminId,
            type: "event_submitted",
            title: "New event pending approval",
            content: `"${input.title}" was submitted for review in ${community.name}.`,
            metadata: {
              eventId: String(event.id),
              communitySlug: input.communitySlug,
            },
            communityId: community.id,
          })),
        );
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.submit",
        targetType: "event",
        targetId: String(event.id),
        metadata: { title: input.title, communitySlug: input.communitySlug },
      });

      return event;
    }),

  importEventFromUrl: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        url: z
          .string()
          .url()
          .refine((u) => u.startsWith("https://"), {
            message: "Event link must start with https://",
          }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Only active community members may use the importer (it makes outbound
      // fetches and can create media docs), matching the submitEvent gate.
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
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
      if (membership?.status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be an active community member to import events",
        });
      }

      const rateLimit = checkEventImportRateLimit(userId);
      if (!rateLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many imports — try again in ${rateLimit.retryAfterSecs}s.`,
        });
      }

      const payload = await getPayloadClient();
      try {
        return await runEventImport(input.url, payload);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Couldn't read that link — please check the URL or fill the form manually.",
        });
      }
    }),

  getPendingCommunityEvents: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true, name: true },
      });
      if (!community) return [];

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
        ),
      });
      if (
        membership?.status !== "active" ||
        (membership.role !== "owner" &&
          membership.role !== "admin" &&
          membership.role !== "moderator")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only community admins and moderators can view pending events",
        });
      }

      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { status: { equals: "draft" } },
            { communityId: { equals: community.id } },
          ],
        },
        sort: "createdAt",
        draft: false,
        depth: 1,
      });

      return docs.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        type: e.type,
        date: e.date,
        location: e.location,
        status: e.status,
        submittedBy: e.submittedBy ?? null,
        communityId: community.id,
        coverImageId:
          e.coverImage && typeof e.coverImage === "object"
            ? ((e.coverImage as { id: number }).id ?? null)
            : null,
        coverImageUrl:
          e.coverImage && typeof e.coverImage === "object"
            ? ((e.coverImage as { url?: string }).url ?? null)
            : null,
      }));
    }),

  getMyEventSubmissions: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) return [];

      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { submittedBy: { equals: userId } },
            { communityId: { equals: community.id } },
            {
              or: [
                { status: { equals: "draft" } },
                { status: { equals: "rejected" } },
              ],
            },
          ],
        },
        sort: "createdAt",
        draft: false,
        depth: 1,
      });

      return docs.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        type: e.type,
        date: e.date,
        location: e.location,
        status: e.status,
        communityId: community.id,
        coverImageId:
          e.coverImage && typeof e.coverImage === "object"
            ? ((e.coverImage as { id: number }).id ?? null)
            : null,
        coverImageUrl:
          e.coverImage && typeof e.coverImage === "object"
            ? ((e.coverImage as { url?: string }).url ?? null)
            : null,
      }));
    }),

  // Full editable record for one event, used to pre-fill the edit/resubmit
  // form. Authorized for community admins/owners (edit) or the original
  // submitter (resubmit). Returns fields shaped for the form (strings, with
  // rich-text description flattened to plain text).
  getEventForEdit: protectedProcedure
    .input(z.object({ eventId: z.number(), communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
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
      if (membership?.status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be an active community member",
        });
      }

      const payload = await getPayloadClient();
      const e = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 1,
      });
      if (e?.communityId !== community.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      const isAdmin =
        membership.role === "owner" || membership.role === "admin";
      const isSubmitter = e.submittedBy === userId;
      if (!isAdmin && !isSubmitter) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only edit your own submissions",
        });
      }

      const cover =
        e.coverImage && typeof e.coverImage === "object"
          ? (e.coverImage as { id: number; url?: string })
          : null;

      const tags = Array.isArray(e.tags)
        ? (e.tags as { tag?: string }[])
            .map((entry) => entry.tag?.trim())
            .filter((tag): tag is string => Boolean(tag))
            .join(", ")
        : "";

      return {
        title: e.title ?? "",
        summary: e.summary ?? "",
        description: lexicalToPlainText(e.description),
        type: e.type,
        date: typeof e.date === "string" ? (e.date.split("T")[0] ?? "") : "",
        startTime: e.startTime ?? "",
        endTime: e.endTime ?? "",
        location: e.location ?? "",
        format: e.format ?? "",
        region: e.region ?? "",
        country: e.country ?? "",
        city: e.city ?? "",
        focus: e.focus ?? "",
        level: e.level ?? "",
        audience: Array.isArray(e.audience) ? e.audience : [],
        sourceUrl: e.sourceUrl ?? "",
        aitFitScore: e.aitFitScore != null ? String(e.aitFitScore) : "",
        tags,
        curatedByAgent: Boolean(e.curatedByAgent),
        discoverySource: e.discoverySource ?? "",
        confidenceScore:
          e.confidenceScore != null ? String(e.confidenceScore) : "",
        lastVerifiedAt:
          typeof e.lastVerifiedAt === "string"
            ? e.lastVerifiedAt.slice(0, 16)
            : "",
        videoUrl: e.videoUrl ?? "",
        maxAttendees: e.maxAttendees != null ? String(e.maxAttendees) : "",
        coverImageId: cover?.id ?? null,
        coverImageUrl: cover?.url ?? null,
      };
    }),

  approveEvent: protectedProcedure
    .input(z.object({ eventId: z.number(), communitySlug: z.string() }))
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
        (membership.role !== "owner" &&
          membership.role !== "admin" &&
          membership.role !== "moderator")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins and moderators can approve events",
        });
      }

      const payload = await getPayloadClient();
      const existing = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });
      if (existing?.communityId !== community.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft events can be approved",
        });
      }

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "published" },
      });

      const submittedBy = existing.submittedBy ?? undefined;
      if (submittedBy) {
        await ctx.db.insert(notifications).values({
          userId: submittedBy,
          type: "event_approved",
          title: "Your event was approved",
          content: `"${existing.title}" is now published in ${community.name}.`,
          metadata: {
            eventId: String(input.eventId),
            communitySlug: input.communitySlug,
          },
          communityId: community.id,
        });
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.approve",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { communitySlug: input.communitySlug },
      });

      return { success: true };
    }),

  rejectEvent: protectedProcedure
    .input(z.object({ eventId: z.number(), communitySlug: z.string() }))
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
        (membership.role !== "owner" &&
          membership.role !== "admin" &&
          membership.role !== "moderator")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins and moderators can reject events",
        });
      }

      const payload = await getPayloadClient();
      const existing = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });
      if (existing?.communityId !== community.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft events can be rejected",
        });
      }

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "rejected" },
      });

      const submittedBy = existing.submittedBy ?? undefined;
      if (submittedBy) {
        await ctx.db.insert(notifications).values({
          userId: submittedBy,
          type: "event_rejected",
          title: "Your event needs revision",
          content: `"${existing.title}" was not approved in ${community.name}. You can edit and resubmit.`,
          metadata: {
            eventId: String(input.eventId),
            communitySlug: input.communitySlug,
          },
          communityId: community.id,
        });
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.reject",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { communitySlug: input.communitySlug },
      });

      return { success: true };
    }),

  resubmitEvent: protectedProcedure
    .input(
      z
        .object({ eventId: z.number(), communitySlug: z.string() })
        .merge(eventUpsertSchema.partial()),
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

      const payload = await getPayloadClient();
      const existing = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });

      if (
        existing?.communityId !== community.id ||
        existing.submittedBy !== userId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only resubmit your own rejected events",
        });
      }

      if ((existing.status as string) !== "rejected") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only rejected events can be resubmitted",
        });
      }

      // Build partial update data (same pattern as updateEvent)
      const data: Record<string, unknown> = { status: "draft" };
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined)
        data.description = plainTextToLexical(input.description ?? "");
      if (input.summary !== undefined)
        data.summary = normalizeOptionalString(input.summary);
      if (input.type !== undefined) data.type = input.type;
      if (input.date !== undefined) data.date = input.date;
      if (input.startTime !== undefined)
        data.startTime = normalizeOptionalString(input.startTime);
      if (input.endTime !== undefined)
        data.endTime = normalizeOptionalString(input.endTime);
      if (input.location !== undefined) data.location = input.location;
      if (input.format !== undefined) data.format = input.format;
      if (input.region !== undefined)
        data.region = normalizeOptionalString(input.region);
      if (input.country !== undefined)
        data.country = normalizeOptionalString(input.country);
      if (input.city !== undefined)
        data.city = normalizeOptionalString(input.city);
      if (input.focus !== undefined) data.focus = input.focus;
      if (input.level !== undefined) data.level = input.level;
      if (input.audience !== undefined) data.audience = input.audience;
      if (input.sourceUrl !== undefined)
        data.sourceUrl = normalizeOptionalString(input.sourceUrl);
      if (input.tags !== undefined)
        data.tags = input.tags
          .map((tag: string) => ({ tag: tag.trim() }))
          .filter((entry: { tag: string }) => entry.tag.length > 0);
      if (input.videoUrl !== undefined)
        data.videoUrl = normalizeOptionalString(input.videoUrl);
      if (input.maxAttendees !== undefined)
        data.maxAttendees = input.maxAttendees;
      if (input.coverImage !== undefined) data.coverImage = input.coverImage;

      const event = await payload.update({
        collection: "events",
        id: input.eventId,
        data,
      });

      // Notify admins/mods that a resubmission is pending
      const admins = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
            sql`${communityMemberships.role} IN ('owner', 'admin', 'moderator')`,
          ),
        );

      if (admins.length > 0) {
        await ctx.db.insert(notifications).values(
          admins.map(({ userId: adminId }) => ({
            userId: adminId,
            type: "event_submitted",
            title: "Event resubmitted for approval",
            content: `"${existing.title}" was resubmitted for review in ${community.name}.`,
            metadata: {
              eventId: String(input.eventId),
              communitySlug: input.communitySlug,
            },
            communityId: community.id,
          })),
        );
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.resubmit",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { communitySlug: input.communitySlug },
      });

      return event;
    }),
});
