// The hackathon layer's coordinator router (ADR-0024/0029). A hackathon is the
// composition of an Event and a Challenge; binding an event to a challenge is
// what makes the challenge team-based. AIT is plumbing only — no cognition.

import { z } from "zod";
import { and, eq, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { RequiredDataFromCollectionSlug } from "payload";

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
  communityMemberships,
  communities,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
import {
  assertBindable,
  BindingError,
} from "@/server/hackathon/binding-invariant";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import {
  deriveSlug,
  buildHackathonChallengeData,
} from "@/server/hackathon/create-defaults";
import { buildEventPayloadData } from "@/server/api/routers/event-upsert-data";
import { EVENT_FORMAT_OPTIONS } from "@/lib/event-metadata";
import {
  cellTemplateSchema,
  cellTemplateToInserts,
} from "@/server/hackathon/cell-template";
import { teamScore, rankTeams, prizeSplit } from "@/server/hackathon/scoring";
import { cellHeatState } from "@/server/hackathon/cell-state";
import { awardXp, awardBadge } from "@/lib/gamification";

/** Load a challenge by id or throw NOT_FOUND. */
async function loadChallenge(challengeId: number) {
  const payload = await getPayloadClient();
  try {
    return await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
  } catch {
    throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found" });
  }
}

/**
 * Resolve the challenge sponsor gate (mirrors `requireGridAdmin`'s challenge
 * branch in work-grid.ts). Returns the Payload challenge doc on success.
 */
async function requireChallengeSponsor(challengeId: number, userId: string) {
  const challenge = await loadChallenge(challengeId);
  if (challenge.creatorId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the challenge sponsor can administer this hackathon",
    });
  }
  return challenge;
}

/** FORBIDDEN unless the caller is an active owner|admin of the community. */
async function assertActiveCommunityAdmin(
  db: typeof import("@/server/db").db,
  communityId: string,
  userId: string,
) {
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
    ),
  });
  if (!isCommunityHackathonAdmin(membership ?? null)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only an owner or admin of this community can manage the hackathon",
    });
  }
}

/**
 * Role-scoped gate (ADR-0031): the caller must be an active owner|admin of the
 * challenge's community. For community-scoped hackathons this replaces the
 * creator-scoped requireChallengeSponsor — a time-boxed contest must not hinge on
 * one person. Returns the Payload challenge doc on success.
 */
async function requireCommunityHackathonAdmin(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const challenge = await loadChallenge(challengeId);
  if (!challenge.communityId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This is not a community hackathon.",
    });
  }
  await assertActiveCommunityAdmin(db, challenge.communityId, userId);
  return challenge;
}

/**
 * Lifecycle-operation gate (ADR-0031): `challenge.communityId` is the
 * discriminator. Community-scoped → any active owner|admin of that community;
 * Hub-wide / CMS-authored (communityId null) → the challenge sponsor
 * (creatorId), so a Hub-wide hackathon can still be locked and finalized.
 * Returns the Payload challenge doc on success.
 */
async function requireHackathonOperator(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const challenge = await loadChallenge(challengeId);
  if (challenge.communityId) {
    await assertActiveCommunityAdmin(db, challenge.communityId, userId);
  } else if (challenge.creatorId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the challenge sponsor can administer this hackathon",
    });
  }
  return challenge;
}

export const hackathonRouter = createTRPCRouter({
  /**
   * One-shot community hackathon scaffold (ADR-0024/0032): a community owner|admin
   * creates a DRAFT Event + DRAFT Challenge and binds them. Both inherit the
   * community's communityId so the binding invariant holds. Draft-tolerant — a
   * mid-sequence failure leaves invisible drafts (no compensation needed).
   */
  createHackathon: protectedProcedure
    .input(
      z
        .object({
          communitySlug: z.string(),
          name: z.string().min(3).max(255),
          description: z.string().max(5000).optional(),
          date: z.string(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          location: z.string().min(1).max(255),
          format: z.enum(EVENT_FORMAT_OPTIONS).optional(),
          teamMin: z.number().int().min(1).default(1),
          teamMax: z.number().int().min(1).default(5),
        })
        .refine((v) => v.teamMin <= v.teamMax, {
          message: "teamMin must not exceed teamMax",
          path: ["teamMin"],
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
      if (!isCommunityHackathonAdmin(membership ?? null)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins can create hackathons",
        });
      }

      const payload = await getPayloadClient();
      const suffix = String(Date.now());

      const challenge = await payload.create({
        collection: "challenges",
        // buildHackathonChallengeData is intentionally db/Payload-free (loose
        // unknown[] objectives/cellTemplate so it stays unit-testable); cast to
        // Payload's strict create type at this boundary.
        data: buildHackathonChallengeData({
          name: input.name,
          descriptionLexical: plainTextToLexical(input.description ?? ""),
          communityId: community.id,
          userId,
          slug: deriveSlug(input.name, `c-${suffix}`),
          teamMin: input.teamMin,
          teamMax: input.teamMax,
        }) as RequiredDataFromCollectionSlug<"challenges">,
      });

      // Validate the binding invariant up front (it holds by construction — both
      // records inherit community.id), then create the event ALREADY bound.
      // Setting challengeId in the create avoids a second write to a
      // drafts-enabled collection. skipGeocode: a brand-new draft event has no
      // published version for the Events geocode afterChange hook to update;
      // letting it run throws NotFound and poisons the surrounding transaction,
      // silently rolling back the write. Hackathon events geocode on publish, if
      // at all, not at draft-create.
      assertBindable(
        { type: "hackathon", communityId: community.id },
        { communityId: challenge.communityId ?? null },
      );
      const event = await payload.create({
        collection: "events",
        data: {
          slug: deriveSlug(input.name, `e-${suffix}`),
          status: "draft",
          communityId: community.id,
          ...buildEventPayloadData({
            title: input.name,
            description: input.description,
            type: "hackathon",
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            location: input.location,
            format: input.format,
          }),
          challengeId: String(challenge.id),
        },
        context: { skipGeocode: true },
      });

      return {
        eventId: Number(event.id),
        eventSlug: event.slug,
        challengeId: Number(challenge.id),
        communitySlug: input.communitySlug,
      };
    }),

  /**
   * Edit a community hackathon's authored content — the cellTemplate task list
   * plus team/prize fields. Role-scoped (ADR-0031). cellTemplate is validated
   * against the canonical schema before it is written.
   */
  updateHackathon: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        eventId: z.number().optional(),
        // Shared identity (written to both the event and the challenge).
        name: z.string().min(3).max(255).optional(),
        description: z.string().max(5000).optional(),
        // Event schedule / place.
        date: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().min(1).max(255).optional(),
        // number = set/replace cover, null = clear it, undefined = leave unchanged
        coverImage: z.number().int().positive().nullable().optional(),
        // Challenge config.
        cellTemplate: cellTemplateSchema.optional(),
        teamMin: z.number().int().min(1).optional(),
        teamMax: z.number().int().min(1).optional(),
        xpReward: z.number().int().min(0).optional(),
        sponsorReward: z.string().max(2000).optional(),
        badgeReward: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireCommunityHackathonAdmin(
        ctx.db,
        input.challengeId,
        userId,
      );
      const payload = await getPayloadClient();
      const lexicalDesc =
        input.description !== undefined
          ? plainTextToLexical(input.description)
          : undefined;

      // cellTemplate is frozen once the bound event leaves draft: lockRosters
      // parses the CURRENT template each run (it re-runs for late-forming
      // teams), so a post-publish edit would hand teams grids from different
      // template versions and skew teamScore/finalRank.
      if (input.cellTemplate !== undefined) {
        const { docs } = await payload.find({
          collection: "events",
          where: { challengeId: { equals: String(input.challengeId) } },
          limit: 1,
          depth: 0,
        });
        const boundEvent = docs[0];
        if (boundEvent && boundEvent.status !== "draft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The task template can no longer be edited after the hackathon is published.",
          });
        }
      }

      // --- Challenge side: identity + cells + team + prize ---
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.title = input.name;
      if (lexicalDesc !== undefined) data.description = lexicalDesc;
      if (input.cellTemplate !== undefined)
        data.cellTemplate = input.cellTemplate;
      if (input.teamMin !== undefined || input.teamMax !== undefined) {
        const minTeamSize =
          input.teamMin ?? challenge.teamConfig?.minTeamSize ?? 1;
        const maxTeamSize =
          input.teamMax ?? challenge.teamConfig?.maxTeamSize ?? 5;
        if (minTeamSize > maxTeamSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Minimum team size cannot exceed the maximum.",
          });
        }
        data.teamConfig = { minTeamSize, maxTeamSize };
      }
      if (
        input.xpReward !== undefined ||
        input.sponsorReward !== undefined ||
        input.badgeReward !== undefined
      ) {
        data.rewards = {
          ...(challenge.rewards ?? {}),
          ...(input.xpReward !== undefined ? { xpReward: input.xpReward } : {}),
          ...(input.sponsorReward !== undefined
            ? { sponsorReward: input.sponsorReward }
            : {}),
          ...(input.badgeReward !== undefined
            ? { badgeReward: input.badgeReward }
            : {}),
        };
      }
      if (Object.keys(data).length > 0) {
        await payload.update({
          collection: "challenges",
          id: input.challengeId,
          data,
        });
      }

      // --- Event side: identity + schedule + place ---
      if (input.eventId !== undefined) {
        const eventData: Record<string, unknown> = {};
        if (input.name !== undefined) eventData.title = input.name;
        if (lexicalDesc !== undefined) eventData.description = lexicalDesc;
        if (input.date !== undefined) eventData.date = input.date;
        if (input.startTime !== undefined)
          eventData.startTime = input.startTime;
        if (input.endTime !== undefined) eventData.endTime = input.endTime;
        if (input.location !== undefined) eventData.location = input.location;
        if (input.coverImage !== undefined)
          eventData.coverImage = input.coverImage;
        if (Object.keys(eventData).length > 0) {
          let ev;
          try {
            ev = await payload.findByID({
              collection: "events",
              id: input.eventId,
              depth: 0,
            });
          } catch {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Event not found",
            });
          }
          if (String(ev.challengeId ?? "") !== String(input.challengeId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is not bound to this hackathon challenge.",
            });
          }
          // skipGeocode: draft events have no published version for the geocode
          // hook to update; letting it run poisons the transaction (see
          // createHackathon). Geocoding happens on publish.
          await payload.update({
            collection: "events",
            id: input.eventId,
            data: eventData,
            context: { skipGeocode: true },
          });
        }
      }

      return { challengeId: input.challengeId };
    }),

  /**
   * Publish a community hackathon: requires >=1 cellTemplate row (no empty
   * hackathon), then flips the Event to `published` and the Challenge to `active`
   * (the challenges status enum is draft|active|completed|archived — there is no
   * `published`). Publishing the event opens team formation. Role-scoped.
   */
  publishHackathon: protectedProcedure
    .input(z.object({ challengeId: z.number(), eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireCommunityHackathonAdmin(
        ctx.db,
        input.challengeId,
        userId,
      );

      const cells = cellTemplateSchema.parse(challenge.cellTemplate ?? []);
      if (cells.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add at least one task before publishing the hackathon.",
        });
      }

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
      if (String(event.challengeId ?? "") !== String(input.challengeId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Event is not bound to this hackathon challenge.",
        });
      }
      await payload.update({
        collection: "challenges",
        id: input.challengeId,
        data: { status: "active" },
      });
      // skipGeocode: these events carry no published Payload version, so the
      // geocode afterChange hook's nested update throws NotFound and poisons the
      // transaction, rolling back the status flip. (See createHackathon.)
      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "published" },
        context: { skipGeocode: true },
      });
      return { published: true };
    }),

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
      const challenge = await requireChallengeSponsor(
        input.challengeId,
        userId,
      );

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
   * are skipped. Operator-scoped (ADR-0031): community owner|admin, or the
   * sponsor for Hub-wide hackathons. (Wiring this to a cron at the event start
   * time is a deferred follow-up; for now an admin triggers it.)
   */
  lockRosters: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireHackathonOperator(
        ctx.db,
        input.challengeId,
        userId,
      );

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

      const created: { teamId: string; gridId: string; cellCount: number }[] =
        [];

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
   * Finalize a hackathon (operator-scoped, ADR-0031). Scores each team from its
   * competitive grid's verified cells, ranks the submitted teams, and awards the
   * challenge's prize XP (split equally) + badge to the winning team.
   * Idempotent: re-running recomputes ranks/scores but never re-pays
   * (prizeAwardedAt guard).
   */
  finalizeHackathon: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireHackathonOperator(
        ctx.db,
        input.challengeId,
        userId,
      );

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
                if (badgeReward)
                  await awardBadge(tx, member.userId, badgeReward);
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

  /** The caller's team for a hackathon challenge (null if none) + roster. */
  myTeam: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [enrollment] = await ctx.db
        .select({ teamId: challengeEnrollments.teamId })
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.challengeId, input.challengeId),
          ),
        )
        .limit(1);
      if (!enrollment?.teamId) return null;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, enrollment.teamId))
        .limit(1);
      if (!team) return null;

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

      return { team, members, isCaptain: team.captainId === userId };
    }),

  /**
   * Public, aggregate progress for a team's competitive grid — the spectator
   * "watch the race" projection (ADR-0030): cell status COUNTS only, never a
   * cell's output or content.
   */
  teamGridStatus: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [grid] = await ctx.db
        .select({ id: workGrids.id })
        .from(workGrids)
        .where(
          and(
            eq(workGrids.teamId, input.teamId),
            eq(workGrids.mode, "competitive"),
          ),
        )
        .limit(1);
      if (!grid) return { total: 0, byStatus: {} as Record<string, number> };

      const cells = await ctx.db
        .select({ status: workCells.status })
        .from(workCells)
        .where(eq(workCells.gridId, grid.id));

      const byStatus: Record<string, number> = {};
      for (const c of cells) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      return { total: cells.length, byStatus };
    }),

  /**
   * Public, content-free per-cell status array for the spectator dashboard
   * heatmap (ADR-0030, amended): the colour of each cell's progress, never its
   * content/output. Ordered stably by cell id so the matrix is stable across
   * polls. Returns an empty array if the team has no competitive grid yet.
   */
  teamHeatmap: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [grid] = await ctx.db
        .select({ id: workGrids.id })
        .from(workGrids)
        .where(
          and(
            eq(workGrids.teamId, input.teamId),
            eq(workGrids.mode, "competitive"),
          ),
        )
        .limit(1);
      if (!grid) return [];

      const cells = await ctx.db
        .select({ id: workCells.id, status: workCells.status })
        .from(workCells)
        .where(eq(workCells.gridId, grid.id))
        .orderBy(workCells.id);

      const cellIds = cells.map((c) => c.id);
      const verified =
        cellIds.length > 0
          ? await ctx.db
              .select({ cellId: workCellResults.cellId })
              .from(workCellResults)
              .where(
                and(
                  inArray(workCellResults.cellId, cellIds),
                  eq(workCellResults.verificationOutcome, "verified"),
                ),
              )
          : [];
      const verifiedCells = new Set(verified.map((v) => v.cellId));

      return cells.map((c) => ({
        heatState: cellHeatState(
          c.status,
          verifiedCells.has(c.id) ? "verified" : null,
        ),
      }));
    }),
});
