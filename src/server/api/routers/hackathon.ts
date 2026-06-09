// The hackathon layer's coordinator router (ADR-0024/0029). A hackathon is the
// composition of an Event and a Challenge; binding an event to a challenge is
// what makes the challenge team-based. AIT is plumbing only — no cognition.

import { z } from "zod";
import { and, eq, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  teams,
  workGrids,
  workCells,
  workCellResults,
  challengeEnrollments,
  memberProfiles,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { assertBindable, BindingError } from "@/server/hackathon/binding-invariant";
import {
  cellTemplateSchema,
  cellTemplateToInserts,
} from "@/server/hackathon/cell-template";
import { teamScore, rankTeams, prizeSplit } from "@/server/hackathon/scoring";
import { awardXp, awardBadge } from "@/lib/gamification";

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
   * The event must be published, not already running a different challenge, and
   * owned by the caller — the challenge-sponsor gate alone must not let a sponsor
   * hijack or clobber an event they do not control.
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

      if (["draft", "rejected", "cancelled"].includes(event.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event is not published.",
        });
      }
      const boundChallengeId = event.challengeId
        ? Number(event.challengeId)
        : null;
      if (boundChallengeId !== null && boundChallengeId !== input.challengeId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Event is already bound to a different challenge.",
        });
      }
      // submittedBy is empty for operator/CMS-authored Hub events — in that case
      // the challenge-sponsor gate is the authority; only block when a different
      // member is the recorded organiser.
      if (event.submittedBy && event.submittedBy !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the event's organiser can bind it to a challenge.",
        });
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

  /**
   * Finalize a hackathon (sponsor-scoped). Scores each team from its competitive
   * grid's verified cells, ranks the submitted teams, and awards the challenge's
   * prize XP (split equally) + badge to the winning team. Idempotent: re-running
   * recomputes ranks/scores but never re-pays (prizeAwardedAt guard).
   */
  finalizeHackathon: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireChallengeSponsor(input.challengeId, userId);

      const rankingMode =
        challenge.rankingMode === "thoroughness" ||
        challenge.rankingMode === "collaboration"
          ? challenge.rankingMode
          : "speed";
      const xpReward = challenge.rewards?.xpReward ?? 0;
      const badgeReward = challenge.rewards?.badgeReward ?? null;

      const challengeTeams = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.challengeId, input.challengeId));
      if (challengeTeams.length === 0) {
        return { ranked: [], winnerTeamId: null };
      }

      const grids = await ctx.db
        .select({ id: workGrids.id, teamId: workGrids.teamId })
        .from(workGrids)
        .where(
          and(
            eq(workGrids.challengeId, input.challengeId),
            eq(workGrids.mode, "competitive"),
          ),
        );
      const gridByTeam = new Map(
        grids
          .filter((g): g is { id: string; teamId: string } => g.teamId !== null)
          .map((g) => [g.teamId, g.id]),
      );

      const gridIds = grids.map((g) => g.id);
      const verifiedRows =
        gridIds.length > 0
          ? await ctx.db
              .select({
                cellId: workCells.id,
                gridId: workCells.gridId,
                verificationMode: workCells.verificationMode,
              })
              .from(workCellResults)
              .innerJoin(workCells, eq(workCellResults.cellId, workCells.id))
              .where(
                and(
                  inArray(workCells.gridId, gridIds),
                  eq(workCellResults.verificationOutcome, "verified"),
                ),
              )
          : [];
      // Defensive: count each verified cell once even if a future path ever
      // produced a second result row for it (today the competitive one-claimer
      // model + completed-on-submit make >1 result per cell unreachable).
      const modesByGrid = new Map<string, string[]>();
      const seenCells = new Set<string>();
      for (const r of verifiedRows) {
        if (seenCells.has(r.cellId)) continue;
        seenCells.add(r.cellId);
        const list = modesByGrid.get(r.gridId) ?? [];
        list.push(r.verificationMode);
        modesByGrid.set(r.gridId, list);
      }

      const scoreByTeam = new Map<string, number>();
      for (const team of challengeTeams) {
        const gridId = gridByTeam.get(team.id);
        const modes = gridId ? (modesByGrid.get(gridId) ?? []) : [];
        scoreByTeam.set(team.id, teamScore(modes));
      }
      const submitted = challengeTeams.filter((t) => t.submittedAt !== null);
      const ranked = rankTeams(
        submitted.map((t) => ({
          teamId: t.id,
          score: scoreByTeam.get(t.id) ?? 0,
          submittedAt: t.submittedAt,
        })),
        rankingMode,
      );
      const rankByTeam = new Map(ranked.map((r) => [r.teamId, r.rank]));
      const winnerTeamId = ranked.find((r) => r.rank === 1)?.teamId ?? null;

      await ctx.db.transaction(async (tx) => {
        for (const team of challengeTeams) {
          await tx
            .update(teams)
            .set({
              score: scoreByTeam.get(team.id) ?? 0,
              finalRank: rankByTeam.get(team.id) ?? null,
            })
            .where(eq(teams.id, team.id));
        }

        if (winnerTeamId) {
          // Challenge-level once-only: if ANY team in this challenge already
          // received the prize in a prior finalize, never pay a second team —
          // even if a re-run's recomputed winner differs because more cells were
          // verified in between. Re-runs still recompute score/finalRank above;
          // only the disbursement is locked.
          const [priorAward] = await tx
            .select({ id: teams.id })
            .from(teams)
            .where(
              and(
                eq(teams.challengeId, input.challengeId),
                isNotNull(teams.prizeAwardedAt),
              ),
            )
            .limit(1);

          if (!priorAward) {
            const [winner] = await tx
              .update(teams)
              .set({ prizeAwardedAt: new Date() })
              .where(
                and(eq(teams.id, winnerTeamId), isNull(teams.prizeAwardedAt)),
              )
              .returning();
            if (winner) {
              const members = await tx
                .select({ userId: challengeEnrollments.userId })
                .from(challengeEnrollments)
                .where(eq(challengeEnrollments.teamId, winnerTeamId));
              const share = prizeSplit(xpReward, members.length);
              for (const member of members) {
                if (share > 0) await awardXp(tx, member.userId, share);
                if (badgeReward) await awardBadge(tx, member.userId, badgeReward);
              }
            }
          }
        }
      });

      return {
        winnerTeamId,
        ranked: ranked.map((r) => ({
          teamId: r.teamId,
          rank: r.rank,
          score: scoreByTeam.get(r.teamId) ?? 0,
        })),
      };
    }),

  /** Public team leaderboard for a hackathon challenge (isPublic-respecting). */
  teamLeaderboard: publicProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.challengeId, input.challengeId),
            ne(teams.status, "disbanded"),
          ),
        );
      if (rows.length === 0) return [];

      const enrollments = await ctx.db
        .select({
          teamId: challengeEnrollments.teamId,
          displayName: memberProfiles.displayName,
          isPublic: memberProfiles.isPublic,
        })
        .from(challengeEnrollments)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, challengeEnrollments.userId),
        )
        .where(
          inArray(
            challengeEnrollments.teamId,
            rows.map((t) => t.id),
          ),
        );

      const facesByTeam = new Map<string, string[]>();
      const countByTeam = new Map<string, number>();
      for (const e of enrollments) {
        if (!e.teamId) continue;
        countByTeam.set(e.teamId, (countByTeam.get(e.teamId) ?? 0) + 1);
        if (e.isPublic) {
          const list = facesByTeam.get(e.teamId) ?? [];
          list.push(e.displayName);
          facesByTeam.set(e.teamId, list);
        }
      }

      return rows
        .map((t) => ({
          teamId: t.id,
          name: t.name,
          score: t.score ?? 0,
          finalRank: t.finalRank,
          submitted: t.submittedAt !== null,
          memberCount: countByTeam.get(t.id) ?? 0,
          memberFaces: facesByTeam.get(t.id) ?? [],
        }))
        .sort((a, b) => {
          if (a.finalRank !== null && b.finalRank !== null) {
            return a.finalRank - b.finalRank;
          }
          if (a.finalRank !== null) return -1;
          if (b.finalRank !== null) return 1;
          return b.score - a.score;
        });
    }),
});
