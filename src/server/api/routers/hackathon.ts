// The hackathon layer's coordinator router (ADR-0024/0029). A hackathon is the
// composition of an Event and a Challenge; binding an event to a challenge is
// what makes the challenge team-based. AIT is plumbing only — no cognition.

import { z } from "zod";
import { and, eq, inArray, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { RequiredDataFromCollectionSlug } from "payload";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  teams,
  agentProfiles,
  workGrids,
  workCells,
  workCellResults,
  challengeEnrollments,
  hackathonCertificates,
  hackathonVotes,
  memberProfiles,
  notifications,
  communityMemberships,
  communities,
  hackathonStaff,
  judgeRankings,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
import {
  hasActiveGrant,
  resolveHackathonCapability,
  type StaffGrantRow,
} from "@/server/hackathon/staff-roles";
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
import { aggregateJudgeRankings } from "@/server/hackathon/judge-aggregation";
import { hackathonPhase } from "@/server/hackathon/phase";
import {
  assertCanToggleLookingForTeam,
  lookingForTeamCandidates,
  LookingForTeamError,
} from "@/server/hackathon/looking-for-team";
import { certificateAwards } from "@/server/hackathon/certificates";
import {
  votingOpen as peoplesChoiceVotingOpen,
  peoplesChoice,
} from "@/server/hackathon/peoples-choice";
import {
  participationFunnel,
  cellCompletion,
  type CellStatusCounts,
} from "@/server/hackathon/analytics";
import { cellHeatState } from "@/server/hackathon/cell-state";
import { mergeAgentStats } from "@/server/hackathon/agent-stats";
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

/** All staff grants for one user on one hackathon (revocation filtered by hasActiveGrant). */
async function loadHackathonGrants(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
): Promise<StaffGrantRow[]> {
  const rows = await db
    .select({ role: hackathonStaff.role, revokedAt: hackathonStaff.revokedAt })
    .from(hackathonStaff)
    .where(
      and(
        eq(hackathonStaff.challengeId, challengeId),
        eq(hackathonStaff.userId, userId),
      ),
    );
  return rows as StaffGrantRow[];
}

/** Load the caller's community membership for a challenge (null for Hub-wide). */
async function loadMembershipForChallenge(
  db: typeof import("@/server/db").db,
  communityId: string | null | undefined,
  userId: string,
) {
  if (!communityId) return null;
  return (
    (await db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userId, userId),
      ),
    })) ?? null
  );
}

/**
 * Organizer-tier gate: community owner/admin, the Hub-wide sponsor, OR an active
 * organizer grant. Used for Setup/Tasks/Analytics + opening judging. Returns the
 * challenge doc.
 */
async function requireHackathonOrganizer(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const challenge = await loadChallenge(challengeId);
  const membership = await loadMembershipForChallenge(
    db,
    challenge.communityId,
    userId,
  );
  const grants = await loadHackathonGrants(db, challengeId, userId);
  const capability = resolveHackathonCapability(membership, grants);
  const isHubSponsor = !challenge.communityId && challenge.creatorId === userId;
  if (capability === "admin" || capability === "organizer" || isHubSponsor) {
    return challenge;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only an organizer or community admin can manage this hackathon",
  });
}

/** Judge-tier gate: an active judge grant is required (admins are not implicitly judges). */
async function requireHackathonJudge(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const challenge = await loadChallenge(challengeId);
  const grants = await loadHackathonGrants(db, challengeId, userId);
  if (!hasActiveGrant(grants, "judge")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an assigned judge can rank this hackathon",
    });
  }
  return challenge;
}

/**
 * Derive the hackathon's current lifecycle phase from server truth (see
 * src/server/hackathon/phase.ts): the bound event's status, the challenge's
 * status, and the teams' lock/finalize markers.
 */
async function currentHackathonPhase(
  db: typeof import("@/server/db").db,
  challengeId: number,
  challengeStatus: string,
  judgingOpenedAt: Date | string | null,
) {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { challengeId: { equals: String(challengeId) } },
        { type: { equals: "hackathon" } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  const markers = await db
    .select({
      status: teams.status,
      finalRank: teams.finalRank,
      prizeAwardedAt: teams.prizeAwardedAt,
    })
    .from(teams)
    .where(eq(teams.challengeId, challengeId));
  return hackathonPhase({
    eventStatus: docs[0]?.status ?? "draft",
    challengeStatus,
    judgingOpenedAt,
    teams: markers,
  });
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
   * Open judging for a hackathon (organizer-scoped). Stamps the challenge's
   * judgingOpenedAt so submitRankings will accept ballots and the lifecycle
   * phase can advance. Payload `date` fields accept ISO strings.
   */
  openJudging: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireHackathonOrganizer(
        ctx.db,
        input.challengeId,
        ctx.session.user.id,
      );
      const payload = await getPayloadClient();
      await payload.update({
        collection: "challenges",
        id: input.challengeId,
        data: { judgingOpenedAt: new Date().toISOString() },
      });
      return { ok: true };
    }),

  /**
   * The submitted teams a judge ranks (judge-scoped), decorated with the
   * caller's own existing rank/comment so the ballot can be re-opened and
   * edited. Only teams with a submittedAt are judgeable.
   */
  judgeableTeams: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireHackathonJudge(
        ctx.db,
        input.challengeId,
        ctx.session.user.id,
      );
      const rows = await ctx.db
        .select({
          teamId: teams.id,
          name: teams.name,
          artifactUrl: teams.artifactUrl,
          artifactSummary: teams.artifactSummary,
          score: teams.score,
          submittedAt: teams.submittedAt,
        })
        .from(teams)
        .where(
          and(
            eq(teams.challengeId, input.challengeId),
            isNotNull(teams.submittedAt),
          ),
        );
      const mine = await ctx.db
        .select({
          teamId: judgeRankings.teamId,
          rank: judgeRankings.rank,
          comment: judgeRankings.comment,
        })
        .from(judgeRankings)
        .where(
          and(
            eq(judgeRankings.challengeId, input.challengeId),
            eq(judgeRankings.judgeUserId, ctx.session.user.id),
          ),
        );
      const byTeam = new Map(mine.map((m) => [m.teamId, m]));
      return rows.map((t) => ({
        ...t,
        myRank: byTeam.get(t.teamId)?.rank ?? null,
        myComment: byTeam.get(t.teamId)?.comment ?? null,
      }));
    }),

  /**
   * Submit (or replace) a judge's complete ranking ballot (judge-scoped).
   * Judging must be open. The ballot must rank every submitted team exactly
   * once with distinct ranks; the prior ballot is replaced atomically.
   */
  submitRankings: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        rankings: z
          .array(
            z.object({
              teamId: z.string(),
              rank: z.number().int().positive(),
              comment: z.string().max(2000).optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const judgeId = ctx.session.user.id;
      const challenge = await requireHackathonJudge(
        ctx.db,
        input.challengeId,
        judgeId,
      );
      if (!challenge.judgingOpenedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Judging is not open yet",
        });
      }
      const submitted = await ctx.db
        .select({ teamId: teams.id })
        .from(teams)
        .where(
          and(
            eq(teams.challengeId, input.challengeId),
            isNotNull(teams.submittedAt),
          ),
        );
      const submittedIds = new Set(submitted.map((t) => t.teamId));
      const givenIds = new Set(input.rankings.map((r) => r.teamId));
      if (
        submittedIds.size !== givenIds.size ||
        [...givenIds].some((id) => !submittedIds.has(id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rank every submitted team exactly once",
        });
      }
      const ranks = input.rankings.map((r) => r.rank);
      if (new Set(ranks).size !== ranks.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ranks must be distinct",
        });
      }
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(judgeRankings)
          .where(
            and(
              eq(judgeRankings.challengeId, input.challengeId),
              eq(judgeRankings.judgeUserId, judgeId),
            ),
          );
        await tx.insert(judgeRankings).values(
          input.rankings.map((r) => ({
            challengeId: input.challengeId,
            judgeUserId: judgeId,
            teamId: r.teamId,
            rank: r.rank,
            comment: r.comment ?? null,
          })),
        );
      });
      return { ok: true };
    }),

  listStaff: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireHackathonOrganizer(
        ctx.db,
        input.challengeId,
        ctx.session.user.id,
      );
      const rows = await ctx.db
        .select({
          id: hackathonStaff.id,
          userId: hackathonStaff.userId,
          role: hackathonStaff.role,
          revokedAt: hackathonStaff.revokedAt,
          grantedAt: hackathonStaff.grantedAt,
        })
        .from(hackathonStaff)
        .where(eq(hackathonStaff.challengeId, input.challengeId));
      const active = rows.filter((r) => r.revokedAt === null);
      return {
        organizers: active.filter((r) => r.role === "organizer"),
        judges: active.filter((r) => r.role === "judge"),
      };
    }),

  grantStaff: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        userId: z.string(),
        role: z.enum(["organizer", "judge"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.session.user.id;
      // Granting organizers is admin-only; granting judges is organizer-or-admin.
      // Both gates load and return the Payload challenge doc, so reuse it.
      const challenge =
        input.role === "organizer"
          ? await requireCommunityHackathonAdmin(
              ctx.db,
              input.challengeId,
              actorId,
            )
          : await requireHackathonOrganizer(ctx.db, input.challengeId, actorId);
      // Atomic upsert: a single first-time grant or a re-grant after revoke both
      // resolve via the (challenge_id, user_id, role) unique index, avoiding the
      // TOCTOU race where two concurrent inserts both hit the duplicate-key error.
      await ctx.db
        .insert(hackathonStaff)
        .values({
          challengeId: input.challengeId,
          userId: input.userId,
          role: input.role,
          grantedBy: actorId,
        })
        .onConflictDoUpdate({
          target: [
            hackathonStaff.challengeId,
            hackathonStaff.userId,
            hackathonStaff.role,
          ],
          set: { revokedAt: null, grantedBy: actorId, grantedAt: new Date() },
        });
      await ctx.db.insert(notifications).values({
        userId: input.userId,
        type: "hackathon_staff_grant",
        title:
          input.role === "organizer"
            ? "You're now an organizer"
            : "You're now a judge",
        content: `You were added as ${input.role === "organizer" ? "an organizer" : "a judge"} for "${challenge.title}".`,
        metadata: { challengeId: String(input.challengeId), role: input.role },
        communityId: challenge.communityId ?? null,
      });
      return { ok: true };
    }),

  revokeStaff: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        userId: z.string(),
        role: z.enum(["organizer", "judge"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.session.user.id;
      if (input.role === "organizer") {
        await requireCommunityHackathonAdmin(
          ctx.db,
          input.challengeId,
          actorId,
        );
      } else {
        await requireHackathonOrganizer(ctx.db, input.challengeId, actorId);
      }
      await ctx.db
        .update(hackathonStaff)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(hackathonStaff.challengeId, input.challengeId),
            eq(hackathonStaff.userId, input.userId),
            eq(hackathonStaff.role, input.role),
            isNull(hackathonStaff.revokedAt),
          ),
        );
      return { ok: true };
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

      // Judge-driven path: if this hackathon has any active judge grants, their
      // aggregated ranking is authoritative; otherwise keep the automated ranking.
      const activeJudges = await ctx.db
        .select({ userId: hackathonStaff.userId })
        .from(hackathonStaff)
        .where(
          and(
            eq(hackathonStaff.challengeId, input.challengeId),
            eq(hackathonStaff.role, "judge"),
            isNull(hackathonStaff.revokedAt),
          ),
        );

      let ranked: { teamId: string; rank: number }[];
      if (activeJudges.length > 0) {
        const rankingRows = await ctx.db
          .select({
            judgeUserId: judgeRankings.judgeUserId,
            teamId: judgeRankings.teamId,
            rank: judgeRankings.rank,
          })
          .from(judgeRankings)
          .where(eq(judgeRankings.challengeId, input.challengeId));
        const submittedIds = submitted.map((t) => t.id);
        const teamsByJudge = new Map<string, Set<string>>();
        for (const r of rankingRows) {
          const set = teamsByJudge.get(r.judgeUserId) ?? new Set<string>();
          set.add(r.teamId);
          teamsByJudge.set(r.judgeUserId, set);
        }
        const allRanked = activeJudges.every((j) => {
          const ranked = teamsByJudge.get(j.userId);
          return !!ranked && submittedIds.every((id) => ranked.has(id));
        });
        if (!allRanked) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Every assigned judge must rank all submitted teams before finalizing (a team may have submitted after a judge ranked). Ask judges to re-submit, or revoke a non-responsive judge.",
          });
        }
        const submittedAtMap = new Map(
          submitted
            .filter((t) => t.submittedAt !== null)
            .map((t) => [t.id, t.submittedAt as Date]),
        );
        ranked = aggregateJudgeRankings(
          rankingRows,
          scoreByTeam,
          submittedAtMap,
        ).map((r) => ({ teamId: r.teamId, rank: r.finalRank }));
      } else {
        ranked = rankTeams(
          submitted.map((t) => ({
            teamId: t.id,
            score: scoreByTeam.get(t.id) ?? 0,
            submittedAt: t.submittedAt,
          })),
          rankingMode,
        );
      }
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

        // Certificates (#163): winner certificates for members of the team(s)
        // that actually received the prize (disbursement marker — re-runs
        // recompute ranks but never re-pay), participation certificates for
        // members of every other submitted team. The unique
        // (challenge_id, user_id) index + ON CONFLICT DO NOTHING make
        // re-finalize structurally idempotent; notifications go only to
        // certificates actually inserted this run.
        const awardedTeams = await tx
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.challengeId, input.challengeId),
              isNotNull(teams.prizeAwardedAt),
            ),
          );
        const awardedIds = new Set(awardedTeams.map((t) => t.id));
        const submittedIds = submitted.map((t) => t.id);
        const memberRows =
          submittedIds.length > 0
            ? await tx
                .select({
                  teamId: challengeEnrollments.teamId,
                  userId: challengeEnrollments.userId,
                })
                .from(challengeEnrollments)
                .where(inArray(challengeEnrollments.teamId, submittedIds))
            : [];
        const awards = certificateAwards(
          challengeTeams.map((t) => ({
            teamId: t.id,
            submitted: t.submittedAt !== null,
            finalRank: rankByTeam.get(t.id) ?? null,
            prizeAwarded: awardedIds.has(t.id),
          })),
          memberRows.filter(
            (m): m is { teamId: string; userId: string } => m.teamId !== null,
          ),
        );
        if (awards.length > 0) {
          const issued = await tx
            .insert(hackathonCertificates)
            .values(
              awards.map((a) => ({
                challengeId: input.challengeId,
                userId: a.userId,
                kind: a.kind,
              })),
            )
            .onConflictDoNothing()
            .returning();
          if (issued.length > 0) {
            await tx.insert(notifications).values(
              issued.map((c) => ({
                userId: c.userId,
                type: "hackathon_certificate",
                title:
                  c.kind === "winner"
                    ? "Winner certificate issued"
                    : "Participation certificate issued",
                content:
                  c.kind === "winner"
                    ? `You earned a winner certificate for "${challenge.title}".`
                    : `You earned a participation certificate for "${challenge.title}".`,
                metadata: {
                  challengeId: String(input.challengeId),
                  kind: c.kind,
                },
                communityId: challenge.communityId ?? null,
              })),
            );
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

  /**
   * Organizer analytics for the manage page (#165): the participation funnel
   * (enrolled → teamed → on a submitted team, with conversion rates) plus
   * cumulative cell-completion buckets (claimed/reported/verified) aggregated
   * across all of the hackathon's competitive grids. Read-only SQL aggregation
   * — counts, never row content. Operator-scoped (ADR-0031), same gate as
   * lockRosters/finalizeHackathon; the rate math lives in analytics.ts.
   */
  analytics: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireHackathonOperator(ctx.db, input.challengeId, userId);

      // The 5 aggregates are independent reads — run them in parallel.
      // The funnel counts non-abandoned enrollments, matching the rest of
      // the platform (challenges.abandon keeps teamId, so filter by status).
      const [
        [enrollment],
        [submittedMembers],
        [teamCounts],
        statusRows,
        [verifiedRow],
      ] = await Promise.all([
        // Funnel stage 1+2 in one pass: count(teamId) skips NULLs, so it
        // counts exactly the enrollments that are on a team (leave/disband
        // null it out).
        ctx.db
          .select({
            enrolled: sql<number>`count(*)`.mapWith(Number),
            teamed: sql<number>`count(${challengeEnrollments.teamId})`.mapWith(
              Number,
            ),
          })
          .from(challengeEnrollments)
          .where(
            and(
              eq(challengeEnrollments.challengeId, input.challengeId),
              ne(challengeEnrollments.status, "abandoned"),
            ),
          ),

        // Stage 3: members whose team has submitted.
        ctx.db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(challengeEnrollments)
          .innerJoin(teams, eq(challengeEnrollments.teamId, teams.id))
          .where(
            and(
              eq(challengeEnrollments.challengeId, input.challengeId),
              ne(challengeEnrollments.status, "abandoned"),
              isNotNull(teams.submittedAt),
            ),
          ),

        // Team-level context for the submitted stage ("3/5 teams submitted").
        ctx.db
          .select({
            total:
              sql<number>`count(*) filter (where ${teams.status} <> 'disbanded')`.mapWith(
                Number,
              ),
            submitted:
              sql<number>`count(*) filter (where ${teams.status} <> 'disbanded' and ${teams.submittedAt} is not null)`.mapWith(
                Number,
              ),
          })
          .from(teams)
          .where(eq(teams.challengeId, input.challengeId)),

        // Cell status buckets across every competitive grid of this hackathon.
        ctx.db
          .select({
            status: workCells.status,
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(workCells)
          .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
          .where(
            and(
              eq(workGrids.challengeId, input.challengeId),
              eq(workGrids.mode, "competitive"),
            ),
          )
          .groupBy(workCells.status),

        // Verified = a VERIFIED result row, the same definition finalize
        // scores by. DISTINCT mirrors finalize's defensive one-result-per-cell
        // stance.
        ctx.db
          .select({
            count:
              sql<number>`count(distinct ${workCellResults.cellId})`.mapWith(
                Number,
              ),
          })
          .from(workCellResults)
          .innerJoin(workCells, eq(workCellResults.cellId, workCells.id))
          .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
          .where(
            and(
              eq(workGrids.challengeId, input.challengeId),
              eq(workGrids.mode, "competitive"),
              eq(workCellResults.verificationOutcome, "verified"),
            ),
          ),
      ]);

      const byStatus: CellStatusCounts = {};
      for (const r of statusRows) byStatus[r.status] = r.count;

      return {
        funnel: participationFunnel({
          enrolled: enrollment?.enrolled ?? 0,
          teamed: enrollment?.teamed ?? 0,
          inSubmittedTeams: submittedMembers?.count ?? 0,
        }),
        teams: {
          total: teamCounts?.total ?? 0,
          submitted: teamCounts?.submitted ?? 0,
        },
        cells: cellCompletion(byStatus, verifiedRow?.count ?? 0),
      };
    }),

  agentStats: publicProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Two independent per-agent aggregates over this hackathon's competitive
      // grids, then merged + ranked by the pure helper. Mirrors analytics().
      const [claimRows, resultRows] = await Promise.all([
        // Cells currently claimed by each agent, with the team they belong to.
        ctx.db
          .select({
            agentId: workCells.claimedBy,
            teamId: workGrids.teamId,
            claimed: sql<number>`count(*)`.mapWith(Number),
          })
          .from(workCells)
          .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
          .where(
            and(
              eq(workGrids.challengeId, input.challengeId),
              eq(workGrids.mode, "competitive"),
              isNotNull(workCells.claimedBy),
            ),
          )
          .groupBy(workCells.claimedBy, workGrids.teamId),

        // Results authored by each agent: reported total + verified subset.
        ctx.db
          .select({
            agentId: workCellResults.agentId,
            reported: sql<number>`count(*)`.mapWith(Number),
            verified:
              sql<number>`count(*) filter (where ${workCellResults.verificationOutcome} = 'verified')`.mapWith(
                Number,
              ),
          })
          .from(workCellResults)
          .innerJoin(workCells, eq(workCellResults.cellId, workCells.id))
          .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
          .where(
            and(
              eq(workGrids.challengeId, input.challengeId),
              eq(workGrids.mode, "competitive"),
              isNotNull(workCellResults.agentId),
            ),
          )
          .groupBy(workCellResults.agentId),
      ]);

      const stats = mergeAgentStats(
        claimRows
          .filter(
            (
              r,
            ): r is {
              agentId: string;
              teamId: string | null;
              claimed: number;
            } => r.agentId !== null,
          )
          .map((r) => ({
            agentId: r.agentId,
            teamId: r.teamId,
            claimed: r.claimed,
          })),
        resultRows
          .filter(
            (r): r is { agentId: string; reported: number; verified: number } =>
              r.agentId !== null,
          )
          .map((r) => ({
            agentId: r.agentId,
            reported: r.reported,
            verified: r.verified,
          })),
      );

      if (stats.length === 0) return [];

      // Decorate with agent identity for display.
      const profiles = await ctx.db
        .select({
          id: agentProfiles.id,
          name: agentProfiles.name,
          avatar: agentProfiles.avatar,
          ownerId: agentProfiles.ownerId,
        })
        .from(agentProfiles)
        .where(
          inArray(
            agentProfiles.id,
            stats.map((s) => s.agentId),
          ),
        );
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      return stats.map((s) => ({
        ...s,
        name: profileById.get(s.agentId)?.name ?? "Agent",
        avatar: profileById.get(s.agentId)?.avatar ?? null,
        ownerId: profileById.get(s.agentId)?.ownerId ?? null,
      }));
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
          userId: challengeEnrollments.userId,
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

      // Faces carry the userId so consumers can link to the public member
      // profile (/members/[id]); private profiles stay anonymous counts only.
      const facesByTeam = new Map<
        string,
        { userId: string; displayName: string }[]
      >();
      const countByTeam = new Map<string, number>();
      for (const e of enrollments) {
        if (!e.teamId) continue;
        countByTeam.set(e.teamId, (countByTeam.get(e.teamId) ?? 0) + 1);
        if (e.isPublic) {
          const list = facesByTeam.get(e.teamId) ?? [];
          list.push({ userId: e.userId, displayName: e.displayName });
          facesByTeam.set(e.teamId, list);
        }
      }

      return rows
        .map((t) => ({
          teamId: t.id,
          name: t.name,
          score: t.score ?? 0,
          finalRank: t.finalRank,
          // Disbursement truth: re-finalizes recompute finalRank but the prize
          // stays with the first winner, so consumers must attribute the prize
          // by this flag, not by finalRank === 1.
          prizeAwarded: t.prizeAwardedAt !== null,
          submitted: t.submittedAt !== null,
          // Project gallery (#167): once a team submits, the when/what/where
          // of the artifact is public data alongside the score.
          submittedAt: t.submittedAt,
          artifactUrl: t.artifactUrl,
          artifactSummary: t.artifactSummary,
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
   * Toggle the caller's "looking for a team" opt-in (#164). Allowed only for a
   * SOLO enrollment in this challenge while the hackathon is forming (phase
   * 'live') — the pure gate lives in looking-for-team.ts. The opt-in UPDATE is
   * re-guarded by `isNull(teamId)` so a concurrent team join can't race the
   * pre-check and resurrect the flag on a teamed enrollment.
   */
  setLookingForTeam: protectedProcedure
    .input(z.object({ challengeId: z.number(), looking: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await loadChallenge(input.challengeId);

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

      const phase = await currentHackathonPhase(
        ctx.db,
        input.challengeId,
        challenge.status ?? "",
        challenge.judgingOpenedAt ?? null,
      );
      try {
        assertCanToggleLookingForTeam({
          phase,
          enrollment: enrollment ?? null,
        });
      } catch (e) {
        if (e instanceof LookingForTeamError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        throw e;
      }

      await ctx.db
        .update(challengeEnrollments)
        .set({ lookingForTeamAt: input.looking ? new Date() : null })
        .where(
          and(
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.challengeId, input.challengeId),
            isNull(challengeEnrollments.teamId),
          ),
        );

      return { lookingForTeam: input.looking };
    }),

  /**
   * The "looking for a team" list (#164): enrolled participants browse
   * opted-in, still-solo members with PUBLIC profiles (hidden profiles are
   * excluded entirely — see looking-for-team.ts), sorted by opt-in time.
   * Gated on the forming ('live') phase, so roster lock empties the list even
   * where a stale flag survives. Also reports the viewer's own opt-in state so
   * the panel can render the toggle. No invitation system: candidates link to
   * their public profile and teams connect via the existing join-code flow.
   */
  lookingForTeamList: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [me] = await ctx.db
        .select({
          teamId: challengeEnrollments.teamId,
          lookingForTeamAt: challengeEnrollments.lookingForTeamAt,
          isPublic: memberProfiles.isPublic,
        })
        .from(challengeEnrollments)
        .leftJoin(
          memberProfiles,
          eq(memberProfiles.userId, challengeEnrollments.userId),
        )
        .where(
          and(
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.challengeId, input.challengeId),
          ),
        )
        .limit(1);

      const viewer = {
        enrolled: me !== undefined,
        solo: me?.teamId === null,
        lookingForTeam: me?.teamId === null && me.lookingForTeamAt !== null,
        // A hidden (or missing) member profile never surfaces in the candidate
        // list; the panel uses this to warn the viewer that opting in won't
        // make them visible. The toggle itself stays allowed — flipping the
        // profile public later makes an existing opt-in appear.
        profileHidden: me !== undefined && me.isPublic !== true,
      };
      // The list is for enrolled participants only — spectators get nothing.
      if (!me) return { open: false, viewer, candidates: [] };

      const challenge = await loadChallenge(input.challengeId);
      const phase = await currentHackathonPhase(
        ctx.db,
        input.challengeId,
        challenge.status ?? "",
        challenge.judgingOpenedAt ?? null,
      );
      if (phase !== "live") return { open: false, viewer, candidates: [] };

      const rows = await ctx.db
        .select({
          userId: challengeEnrollments.userId,
          teamId: challengeEnrollments.teamId,
          lookingForTeamAt: challengeEnrollments.lookingForTeamAt,
          isPublic: memberProfiles.isPublic,
          displayName: memberProfiles.displayName,
          skills: memberProfiles.skills,
        })
        .from(challengeEnrollments)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, challengeEnrollments.userId),
        )
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            isNotNull(challengeEnrollments.lookingForTeamAt),
            isNull(challengeEnrollments.teamId),
            // Abandoned enrollments never surface (SQL-level filter; status is
            // not part of the pure projection input below) — consistent with
            // the analytics funnel.
            ne(challengeEnrollments.status, "abandoned"),
          ),
        );

      return {
        open: true,
        viewer,
        candidates: lookingForTeamCandidates(rows, { excludeUserId: userId }),
      };
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

  /**
   * Cast (or retarget) the caller's People's Choice vote (#169). Any
   * authenticated member — enrolled or not — gets exactly ONE vote per
   * hackathon: the unique (challenge_id, user_id) index makes that structural
   * and the UPSERT makes it changeable while the window is open. The window
   * follows the lifecycle (open iff phase === 'locked'; see
   * peoples-choice.ts), derived server-side from the same event/phase truth
   * as setLookingForTeam so a stale client can't vote early or late. Only
   * submitted, non-disbanded teams of THIS challenge are votable — exactly
   * the set the gallery shows. Deliberately non-scoring (ADR-0029).
   */
  castPeoplesChoiceVote: protectedProcedure
    .input(z.object({ challengeId: z.number(), teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await loadChallenge(input.challengeId);
      const phase = await currentHackathonPhase(
        ctx.db,
        input.challengeId,
        challenge.status ?? "",
        challenge.judgingOpenedAt ?? null,
      );
      if (!peoplesChoiceVotingOpen(phase)) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Voting is not open — it runs from roster lock until the results are finalized.",
        });
      }

      const [team] = await ctx.db
        .select({ id: teams.id, submittedAt: teams.submittedAt })
        .from(teams)
        .where(
          and(
            eq(teams.id, input.teamId),
            eq(teams.challengeId, input.challengeId),
            ne(teams.status, "disbanded"),
          ),
        )
        .limit(1);
      if (team?.submittedAt == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only submitted projects in this hackathon can be voted for.",
        });
      }

      await ctx.db
        .insert(hackathonVotes)
        .values({
          challengeId: input.challengeId,
          userId,
          teamId: input.teamId,
        })
        .onConflictDoUpdate({
          target: [hackathonVotes.challengeId, hackathonVotes.userId],
          // updatedAt is bumped by the column's $onUpdate hook, which drizzle
          // applies to onConflictDoUpdate sets too.
          set: { teamId: input.teamId },
        });

      return { teamId: input.teamId };
    }),

  /**
   * Public People's Choice projection for the gallery and winners pages
   * (#169): per-team vote counts, whether the window is open, the viewer's
   * current vote (null when unauthenticated), and — only once finalized —
   * the People's Choice team. Kept separate from teamLeaderboard so the
   * scored leaderboard projection stays untouched (non-scoring by
   * construction, ADR-0029).
   */
  peoplesChoiceState: publicProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const challenge = await loadChallenge(input.challengeId);
      const phase = await currentHackathonPhase(
        ctx.db,
        input.challengeId,
        challenge.status ?? "",
        challenge.judgingOpenedAt ?? null,
      );

      const counts = await ctx.db
        .select({
          teamId: hackathonVotes.teamId,
          votes: sql<number>`count(*)::int`,
        })
        .from(hackathonVotes)
        .where(eq(hackathonVotes.challengeId, input.challengeId))
        .groupBy(hackathonVotes.teamId);

      let viewerVote: string | null = null;
      if (ctx.session?.user) {
        const [mine] = await ctx.db
          .select({ teamId: hackathonVotes.teamId })
          .from(hackathonVotes)
          .where(
            and(
              eq(hackathonVotes.challengeId, input.challengeId),
              eq(hackathonVotes.userId, ctx.session.user.id),
            ),
          )
          .limit(1);
        viewerVote = mine?.teamId ?? null;
      }

      // The award only exists once finalized; it is recomputed per request
      // from the (now-stable) votes table. The submittedAt tiebreak needs the
      // voted teams' submission times (see peoples-choice.ts). Disbanded
      // teams are excluded — teamLeaderboard never shows them, so a team
      // disbanded after voting drops out and the award falls to the
      // runner-up instead of pointing at a vanished card.
      let peoplesChoiceTeamId: string | null = null;
      if (phase === "finalized" && counts.length > 0) {
        const teamRows = await ctx.db
          .select({ id: teams.id, submittedAt: teams.submittedAt })
          .from(teams)
          .where(
            and(
              inArray(
                teams.id,
                counts.map((c) => c.teamId),
              ),
              ne(teams.status, "disbanded"),
            ),
          );
        const submittedAtById = new Map(
          teamRows.map((t) => [t.id, t.submittedAt]),
        );
        peoplesChoiceTeamId = peoplesChoice(
          counts
            .filter((c) => submittedAtById.has(c.teamId))
            .map((c) => ({
              teamId: c.teamId,
              votes: c.votes,
              submittedAt: submittedAtById.get(c.teamId) ?? null,
            })),
        );
      }

      return {
        votingOpen: peoplesChoiceVotingOpen(phase),
        counts,
        viewerVote,
        peoplesChoiceTeamId,
      };
    }),
});
