// Team formation for hackathons (ADR-0029). A team is a grouping over
// enrollments: creating or joining is ONE action that bundles the bound event's
// registration + a challenge enrollment carrying teamId. `unique(userId,
// challengeId)` gives "one team per member per hackathon" for free. eventId and
// maxSize are denormalised onto the team at creation so join/leave touch no
// Payload. The enrollment+registration writes run inside a transaction for
// atomicity (inlined rather than a shared helper, to match the codebase's
// "helpers take db, transactions are inline" convention).

import { z } from "zod";
import { and, eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  teams,
  challengeEnrollments,
  eventRegistrations,
  memberProfiles,
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

export const teamsRouter = createTRPCRouter({
  /** Create a team for a hackathon challenge; the caller becomes captain. */
  createTeam: protectedProcedure
    .input(z.object({ challengeId: z.number(), name: z.string().min(1).max(100) }))
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

        await tx
          .insert(challengeEnrollments)
          .values({
            userId,
            challengeId: input.challengeId,
            teamId: team.id,
            status: "active",
          })
          .onConflictDoUpdate({
            target: [
              challengeEnrollments.userId,
              challengeEnrollments.challengeId,
            ],
            set: { teamId: team.id, status: "active" },
          });

        await tx
          .insert(eventRegistrations)
          .values({
            userId,
            eventId: Number(event.id),
            status: "registered",
          })
          .onConflictDoNothing();

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
        await tx
          .insert(challengeEnrollments)
          .values({
            userId,
            challengeId: team.challengeId,
            teamId: team.id,
            status: "active",
          })
          .onConflictDoUpdate({
            target: [
              challengeEnrollments.userId,
              challengeEnrollments.challengeId,
            ],
            set: { teamId: team.id, status: "active" },
          });
        await tx
          .insert(eventRegistrations)
          .values({ userId, eventId: team.eventId, status: "registered" })
          .onConflictDoNothing();
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

  /** Read a team and its members (participant view). */
  getTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      const members = await ctx.db
        .select({
          userId: challengeEnrollments.userId,
          displayName: memberProfiles.displayName,
        })
        .from(challengeEnrollments)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, challengeEnrollments.userId),
        )
        .where(eq(challengeEnrollments.teamId, team.id));

      return { team, members };
    }),
});
