import { z } from "zod";
import { eq, and, sql, asc } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { eventRegistrations, memberProfiles, user } from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { getPayloadClient } from "@/server/payload";
import {
  sendRegistrationConfirmation,
  sendCancellationConfirmation,
  sendWaitlistPromotion,
} from "@/server/email";
import { getMollie } from "@/server/mollie";
import { env } from "@/env";

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
        return { registration: existing[0]!, alreadyRegistered: true, checkoutUrl: null };
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
      const isFull =
        maxAttendees !== null && currentCount >= maxAttendees;

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

      return { registration: registration!, alreadyRegistered: false, checkoutUrl: null };
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
        .leftJoin(memberProfiles, eq(eventRegistrations.userId, memberProfiles.userId))
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
});
