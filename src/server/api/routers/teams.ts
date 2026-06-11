// Team formation for hackathons (ADR-0029). A team is a grouping over
// enrollments: creating or joining is ONE action that bundles the bound event's
// registration + a challenge enrollment carrying teamId. `unique(userId,
// challengeId)` gives "one team per member per hackathon" for free. eventId and
// maxSize are denormalised onto the team at creation so join/leave touch no
// Payload. The enrollment+registration writes run inside a transaction for
// atomicity via the shared `joinTeamBundle` helper, whose enrollment upsert is
// guarded (setWhere teamId IS NULL) so a concurrent join can never silently move
// a member already on another team — the conflicting row isn't updated and we
// surface a CONFLICT.

import { z } from "zod";
import { and, eq, count, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  teams,
  challengeEnrollments,
  eventRegistrations,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { generateTeamJoinCode } from "@/server/hackathon/team-join-code";
import {
  assertCanJoinTeam,
  TeamJoinError,
} from "@/server/hackathon/team-membership";

/** Look up the published hackathon event bound to a challenge, or null. */
async function hackathonEventForChallenge(challengeId: number) {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { challengeId: { equals: String(challengeId) } },
        { type: { equals: "hackathon" } },
        { status: { not_in: ["draft", "rejected", "cancelled"] } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

/** Guard: reject if the user already holds a team for this challenge. */
async function assertNotAlreadyOnTeam(
  db: typeof import("@/server/db").db,
  userId: string,
  challengeId: number,
) {
  const existing = await db.query.challengeEnrollments.findFirst({
    where: and(
      eq(challengeEnrollments.userId, userId),
      eq(challengeEnrollments.challengeId, challengeId),
    ),
  });
  if (existing?.teamId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already on a team for this hackathon.",
    });
  }
}

type Tx = Parameters<
  Parameters<(typeof import("@/server/db").db)["transaction"]>[0]
>[0];

/**
 * Inside a transaction: enrol the user carrying `teamId` and register them for
 * the event, both idempotently. The enrollment upsert is guarded by
 * `setWhere isNull(teamId)`, so if a concurrent join already put this user on a
 * (different) team between the pre-check and here, the conflicting row is NOT
 * updated — we surface a CONFLICT rather than silently moving them. Event
 * registration is pre-checked because `event_registration` has no unique
 * (user,event) constraint (mirrors the guard in events.ts).
 */
async function joinTeamBundle(
  tx: Tx,
  args: {
    userId: string;
    challengeId: number;
    eventId: number;
    teamId: string;
  },
) {
  const [enrolled] = await tx
    .insert(challengeEnrollments)
    .values({
      userId: args.userId,
      challengeId: args.challengeId,
      teamId: args.teamId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [challengeEnrollments.userId, challengeEnrollments.challengeId],
      // Joining a team ends the search: clear the looking-for-team opt-in
      // (#164) in the same write that sets teamId.
      set: { teamId: args.teamId, status: "active", lookingForTeamAt: null },
      setWhere: isNull(challengeEnrollments.teamId),
    })
    .returning({ id: challengeEnrollments.id });

  if (!enrolled) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already on a team for this hackathon.",
    });
  }

  const [existingReg] = await tx
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, args.userId),
        eq(eventRegistrations.eventId, args.eventId),
      ),
    )
    .limit(1);
  if (!existingReg) {
    await tx.insert(eventRegistrations).values({
      userId: args.userId,
      eventId: args.eventId,
      status: "registered",
    });
  }
}

export const teamsRouter = createTRPCRouter({
  /** Create a team for a hackathon challenge; the caller becomes captain. */
  createTeam: protectedProcedure
    .input(
      z.object({ challengeId: z.number(), name: z.string().min(1).max(100) }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const event = await hackathonEventForChallenge(input.challengeId);
      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This challenge is not a hackathon (no bound event).",
        });
      }

      const payload = await getPayloadClient();
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      const maxSize = challenge.teamConfig?.maxTeamSize ?? 5;

      await assertNotAlreadyOnTeam(ctx.db, userId, input.challengeId);

      return ctx.db.transaction(async (tx) => {
        const [team] = await tx
          .insert(teams)
          .values({
            challengeId: input.challengeId,
            eventId: Number(event.id),
            name: input.name,
            captainId: userId,
            joinCode: generateTeamJoinCode(),
            maxSize,
            status: "forming",
          })
          .returning();

        if (!team) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create team",
          });
        }

        await joinTeamBundle(tx, {
          userId,
          challengeId: input.challengeId,
          eventId: Number(event.id),
          teamId: team.id,
        });

        return team;
      });
    }),

  /** Join an existing forming team by its share code. */
  joinTeam: protectedProcedure
    .input(z.object({ joinCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.joinCode, input.joinCode))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      await assertNotAlreadyOnTeam(ctx.db, userId, team.challengeId);

      const [sizeRow] = await ctx.db
        .select({ value: count() })
        .from(challengeEnrollments)
        .where(eq(challengeEnrollments.teamId, team.id));
      const currentSize = Number(sizeRow?.value ?? 0);

      try {
        assertCanJoinTeam({
          status: team.status,
          currentSize,
          maxSize: team.maxSize,
        });
      } catch (e) {
        if (e instanceof TeamJoinError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        throw e;
      }

      await ctx.db.transaction(async (tx) => {
        await joinTeamBundle(tx, {
          userId,
          challengeId: team.challengeId,
          eventId: team.eventId,
          teamId: team.id,
        });
      });

      return team;
    }),

  /** Leave a forming team. The captain must disband instead. */
  leaveTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }
      if (team.status !== "forming") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The roster is locked; you cannot leave now.",
        });
      }
      if (team.captainId === userId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The captain must disband the team rather than leave.",
        });
      }

      await ctx.db
        .update(challengeEnrollments)
        .set({ teamId: null })
        .where(
          and(
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.teamId, input.teamId),
          ),
        );

      return { left: true };
    }),

  /**
   * Captain disbands a forming team: releases the whole roster (every member's
   * enrollment goes back to teamId=null, so they can re-form or join elsewhere)
   * and marks the team `disbanded` so the leaderboard drops it. Forming-only —
   * once rosters lock the team is committed to the contest. This is the captain's
   * counterpart to `leaveTeam` (which the captain is forbidden from using).
   */
  disbandTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }
      if (team.captainId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the team captain can disband the team.",
        });
      }
      if (team.status !== "forming") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The roster is locked; the team can no longer be disbanded.",
        });
      }

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(challengeEnrollments)
          .set({ teamId: null })
          .where(eq(challengeEnrollments.teamId, input.teamId));
        await tx
          .update(teams)
          .set({ status: "disbanded" })
          .where(eq(teams.id, input.teamId));
      });

      return { disbanded: true };
    }),

  /** Captain freezes the team's submission (locked rosters only, once). */
  submitTeam: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        artifactUrl: z.string().url().max(2048).optional(),
        artifactSummary: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }
      if (team.captainId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the team captain can submit.",
        });
      }
      if (team.status !== "locked") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The team can only be submitted once its roster is locked (the hacking window has opened).",
        });
      }
      if (team.submittedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This team has already been submitted.",
        });
      }

      const [updated] = await ctx.db
        .update(teams)
        .set({
          submittedAt: new Date(),
          artifactUrl: input.artifactUrl ?? null,
          artifactSummary: input.artifactSummary ?? null,
        })
        .where(and(eq(teams.id, input.teamId), isNull(teams.submittedAt)))
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This team has already been submitted.",
        });
      }

      return updated;
    }),
});
