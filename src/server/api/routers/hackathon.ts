// The hackathon layer's coordinator router (ADR-0024/0029). A hackathon is the
// composition of an Event and a Challenge; binding an event to a challenge is
// what makes the challenge team-based. AIT is plumbing only — no cognition.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { teams, workGrids, workCells } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { assertBindable, BindingError } from "@/server/hackathon/binding-invariant";
import {
  cellTemplateSchema,
  cellTemplateToInserts,
} from "@/server/hackathon/cell-template";

/**
 * Resolve the challenge sponsor gate (mirrors `requireGridAdmin`'s challenge
 * branch in work-grid.ts). Returns the Payload challenge doc on success.
 */
async function requireChallengeSponsor(challengeId: number, userId: string) {
  const payload = await getPayloadClient();
  let challenge;
  try {
    challenge = await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
  } catch {
    throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found" });
  }
  if (challenge.creatorId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the challenge sponsor can administer this hackathon",
    });
  }
  return challenge;
}

export const hackathonRouter = createTRPCRouter({
  /**
   * Bind a hackathon event to a challenge — the act that makes the challenge
   * team-based (ADR-0029). Sponsor-scoped; enforces the communityId invariant.
   */
  bindChallenge: protectedProcedure
    .input(z.object({ eventId: z.number(), challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireChallengeSponsor(input.challengeId, userId);

      const payload = await getPayloadClient();
      let event;
      try {
        event = await payload.findByID({
          collection: "events",
          id: input.eventId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      try {
        assertBindable(
          { type: event.type, communityId: event.communityId ?? null },
          { communityId: challenge.communityId ?? null },
        );
      } catch (e) {
        if (e instanceof BindingError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { challengeId: String(input.challengeId) },
      });

      return { eventId: input.eventId, challengeId: input.challengeId };
    }),

  /**
   * Lock all forming teams and instantiate one competitive grid per team from
   * the challenge's cellTemplate (ADR-0029). Idempotent: teams already locked
   * are skipped. Sponsor-scoped. (Wiring this to a cron at the event start time
   * is a deferred follow-up; for now an admin triggers it.)
   */
  lockRosters: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireChallengeSponsor(input.challengeId, userId);

      const template = cellTemplateSchema.parse(challenge.cellTemplate ?? []);

      const forming = await ctx.db
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.challengeId, input.challengeId),
            eq(teams.status, "forming"),
          ),
        );

      const created: { teamId: string; gridId: string; cellCount: number }[] = [];

      for (const team of forming) {
        await ctx.db.transaction(async (tx) => {
          const [locked] = await tx
            .update(teams)
            .set({ status: "locked" })
            .where(and(eq(teams.id, team.id), eq(teams.status, "forming")))
            .returning();
          if (!locked) return; // raced — another lock won

          const [grid] = await tx
            .insert(workGrids)
            .values({
              mode: "competitive",
              status: "active",
              challengeId: input.challengeId,
              communityId: null,
              teamId: team.id,
            })
            .returning();
          if (!grid) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create competitive grid",
            });
          }

          const inserts = cellTemplateToInserts(template, grid.id);
          if (inserts.length > 0) {
            await tx.insert(workCells).values(inserts);
          }

          created.push({
            teamId: team.id,
            gridId: grid.id,
            cellCount: inserts.length,
          });
        });
      }

      return { lockedTeams: created.length, grids: created };
    }),
});
