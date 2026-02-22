import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { eventRegistrations, memberProfiles } from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

export const eventsRouter = createTRPCRouter({
  /**
   * Register the current user for an event.
   * If maxAttendees is set and the event is full, the user is waitlisted.
   */
  register: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        maxAttendees: z.number().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user is already registered (not cancelled)
      const existing = await ctx.db
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, input.eventId),
            eq(eventRegistrations.userId, userId),
            sql`${eventRegistrations.status} != 'cancelled'`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return { registration: existing[0]!, alreadyRegistered: true };
      }

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
      const status =
        input.maxAttendees !== null && currentCount >= input.maxAttendees
          ? "waitlisted"
          : "registered";

      const [registration] = await ctx.db
        .insert(eventRegistrations)
        .values({
          eventId: input.eventId,
          userId,
          status,
        })
        .returning();

      // Award XP for registration (only if user has a profile)
      const [profile] = await ctx.db
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);

      if (profile) {
        await awardXp(ctx.db, userId, XP_AMOUNTS.REGISTER_EVENT);
      }

      return { registration: registration!, alreadyRegistered: false };
    }),

  /**
   * Cancel the current user's registration for an event.
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
            sql`${eventRegistrations.status} != 'cancelled'`,
          ),
        );

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
          sql`${eventRegistrations.status} != 'cancelled'`,
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
            sql`${eventRegistrations.status} != 'cancelled'`,
          ),
        )
        .limit(1);

      return registration ?? null;
    }),
});
