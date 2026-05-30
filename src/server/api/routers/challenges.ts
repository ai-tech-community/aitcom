import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";
import type { Challenge } from "@/payload-types";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";

const challengeIdInputSchema = z.object({ challengeId: z.number() });
import { getPayloadClient } from "@/server/payload";
import {
  logActivity,
  checkEnrollmentCompletion,
} from "@/server/agent/activity";
import { sendChallengeSubmissionConfirmation } from "@/server/email";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import {
  challengeEnrollments,
  challengeProgress,
  challengeTestResults,
  challengeChannels,
  challengeThreads,
  challengeReplies,
  memberProfiles,
  user,
} from "@/server/db/schema";
// ── XP auto-calculation ───────────────────────────────────────────────────
// Creators never set XP directly. The platform calculates it from difficulty
// and objective verification modes to prevent gaming.

const DIFFICULTY_BASE_XP: Record<string, number> = {
  beginner: 50,
  intermediate: 100,
  advanced: 200,
  expert: 500,
};

const VERIFICATION_WEIGHT: Record<string, number> = {
  test: 1.5,
  "peer-review": 1.3,
  "platform-action": 1.0,
  "self-report": 0.8,
};

function calculateXpReward(
  difficulty: string,
  objectives: { verification?: string }[],
): number {
  const base = DIFFICULTY_BASE_XP[difficulty] ?? 50;
  const avgWeight =
    objectives.length > 0
      ? objectives.reduce(
          (sum, o) =>
            sum + (VERIFICATION_WEIGHT[o.verification ?? "self-report"] ?? 1),
          0,
        ) / objectives.length
      : 1;
  return Math.round(base * avgWeight);
}

export const challengesRouter = createTRPCRouter({
  // ── List active + upcoming challenges ─────────────────────────────────────

  list: publicProcedure
    .input(
      z
        .object({
          difficulty: z
            .enum(["beginner", "intermediate", "advanced", "expert"])
            .optional(),
          type: z.enum(["weekly", "monthly", "open-ended"]).optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const whereConditions: Where = {
        status: { in: ["active"] },
      };

      if (input?.difficulty) {
        whereConditions.difficulty = { equals: input.difficulty };
      }
      if (input?.type) {
        whereConditions.type = { equals: input.type };
      }
      if (input?.tags && input.tags.length > 0) {
        whereConditions.tags = { in: input.tags };
      }

      const { docs } = await payload.find({
        collection: "challenges",
        where: whereConditions,
        sort: "-startsAt",
        limit: 50,
        depth: 0,
      });

      return docs;
    }),

  // ── Get challenge by ID ───────────────────────────────────────────────────

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      try {
        const challenge = await payload.findByID({
          collection: "challenges",
          id: input.id,
          depth: 0,
        });
        return challenge;
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Challenge not found",
        });
      }
    }),

  // ── Enroll in a challenge ─────────────────────────────────────────────────

  enroll: protectedProcedure
    .input(challengeIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { challengeId } = challengeIdInputSchema.parse(input);

      // Fetch challenge from Payload
      const payload = await getPayloadClient();
      let challenge;
      try {
        challenge = await payload.findByID({
          collection: "challenges",
          id: challengeId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Challenge not found",
        });
      }

      // Validate challenge is active
      if (challenge.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Challenge is not currently active",
        });
      }

      // Check maxParticipants (0 = unlimited)
      const maxParticipantsRaw =
        typeof challenge.maxParticipants === "number"
          ? challenge.maxParticipants
          : Number(challenge.maxParticipants ?? 0);
      const maxParticipants =
        Number.isFinite(maxParticipantsRaw) && maxParticipantsRaw > 0
          ? maxParticipantsRaw
          : 0;
      if (maxParticipants > 0) {
        const [countResult] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(challengeEnrollments)
          .where(
            and(
              eq(challengeEnrollments.challengeId, challengeId),
              sql`${challengeEnrollments.status} != 'abandoned'`,
            ),
          );

        const currentCount = countResult?.count ?? 0;
        if (currentCount >= maxParticipants) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Challenge is full",
          });
        }
      }

      // Create enrollment (unique constraint on userId + challengeId)
      const [enrollment] = await ctx.db
        .insert(challengeEnrollments)
        .values({
          challengeId,
          userId,
          status: "active",
        })
        .onConflictDoNothing()
        .returning();

      if (!enrollment) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You are already enrolled in this challenge",
        });
      }

      // Create progress rows for each objective (with verificationMode)
      const objectives = Array.isArray(challenge.objectives)
        ? challenge.objectives
        : [];
      if (objectives.length > 0) {
        await ctx.db.insert(challengeProgress).values(
          objectives.map((obj: { verification?: string }, index: number) => ({
            enrollmentId: enrollment.id,
            objectiveIndex: index,
            currentCount: 0,
            verificationMode: (obj.verification ?? "self-report") as
              | "platform-action"
              | "test"
              | "self-report"
              | "peer-review",
          })),
        );
      }

      // Ensure challenge has a channel
      let [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, challengeId))
        .limit(1);

      if (!channel) {
        [channel] = await ctx.db
          .insert(challengeChannels)
          .values({ challengeId })
          .onConflictDoNothing()
          .returning();

        // If race condition, fetch existing
        if (!channel) {
          [channel] = await ctx.db
            .select()
            .from(challengeChannels)
            .where(eq(challengeChannels.challengeId, challengeId))
            .limit(1);
        }
      }

      // Create progress-log thread for this participant
      let progressLogThreadId: string | undefined;
      if (channel) {
        const profile = await ctx.db
          .select({ displayName: memberProfiles.displayName })
          .from(memberProfiles)
          .where(eq(memberProfiles.userId, userId))
          .limit(1);

        const displayName = profile[0]?.displayName ?? "Member";

        const [progressLogThread] = await ctx.db
          .insert(challengeThreads)
          .values({
            channelId: channel.id,
            type: "progress-log",
            authorId: userId,
            authorType: "member",
            title: `Progress Log: ${displayName}`,
            content: `Progress log for ${displayName}'s journey through this challenge.`,
          })
          .returning();

        // Store thread reference on enrollment
        if (progressLogThread) {
          progressLogThreadId = progressLogThread.id;
          await ctx.db
            .update(challengeEnrollments)
            .set({ progressLogThreadId: progressLogThread.id })
            .where(eq(challengeEnrollments.id, enrollment.id));
        }
      }

      // Log activity
      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.enrolled",
        targetType: "challenges",
        targetId: String(challengeId),
        communityId: challenge.communityId ?? undefined,
        collabSessionId: progressLogThreadId,
        metadata: {
          title: challenge.title,
          collaborationModel: challenge.collaborationModel ?? undefined,
        },
      });

      return enrollment;
    }),

  // ── Abandon a challenge ───────────────────────────────────────────────────

  abandon: protectedProcedure
    .input(challengeIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { challengeId } = challengeIdInputSchema.parse(input);

      const [updated] = await ctx.db
        .update(challengeEnrollments)
        .set({ status: "abandoned" })
        .where(
          and(
            eq(challengeEnrollments.challengeId, challengeId),
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.status, "active"),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active enrollment not found",
        });
      }

      // Log activity
      const payload = await getPayloadClient();
      let title = "Challenge";
      let collaborationModel: string | undefined;
      try {
        const challenge = await payload.findByID({
          collection: "challenges",
          id: challengeId,
          depth: 0,
        });
        title = challenge.title;
        collaborationModel = challenge.collaborationModel ?? undefined;
      } catch {
        // use fallback title
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.abandoned",
        targetType: "challenges",
        targetId: String(challengeId),
        collabSessionId: updated.progressLogThreadId ?? undefined,
        metadata: { title, collaborationModel },
      });

      return { success: true };
    }),

  // ── Get my enrollments ────────────────────────────────────────────────────

  getMyEnrollments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const enrollments = await ctx.db
      .select()
      .from(challengeEnrollments)
      .where(eq(challengeEnrollments.userId, userId))
      .orderBy(desc(challengeEnrollments.enrolledAt));

    return enrollments;
  }),

  // ── Get progress for a specific enrollment ────────────────────────────────

  getProgress: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Find enrollment by challengeId + userId
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        return null;
      }

      const progress = await ctx.db
        .select()
        .from(challengeProgress)
        .where(eq(challengeProgress.enrollmentId, enrollment.id));

      return { enrollment, progress };
    }),

  // ── Leaderboard for a challenge ───────────────────────────────────────────

  getLeaderboard: publicProcedure
    .input(z.object({ challengeId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      // Fetch challenge to determine ranking mode
      const payload = await getPayloadClient();
      let rankingMode: "speed" | "thoroughness" | "collaboration" = "speed";
      try {
        const challenge = await payload.findByID({
          collection: "challenges",
          id: input.challengeId,
          depth: 0,
        });
        if (
          challenge.rankingMode === "speed" ||
          challenge.rankingMode === "thoroughness" ||
          challenge.rankingMode === "collaboration"
        ) {
          rankingMode = challenge.rankingMode;
        }
      } catch {
        // Use default ranking mode
      }

      // Get all enrollments for this challenge (non-abandoned)
      const enrollments = await ctx.db
        .select({
          enrollmentId: challengeEnrollments.id,
          userId: challengeEnrollments.userId,
          status: challengeEnrollments.status,
          completedAt: challengeEnrollments.completedAt,
          enrolledAt: challengeEnrollments.enrolledAt,
        })
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            sql`${challengeEnrollments.status} != 'abandoned'`,
          ),
        );

      if (enrollments.length === 0) {
        return [];
      }

      // Count completed objectives per enrollment
      const enrollmentIds = enrollments.map((e) => e.enrollmentId);
      const progressRows = await ctx.db
        .select({
          enrollmentId: challengeProgress.enrollmentId,
          completedCount: sql<number>`count(*) filter (where ${challengeProgress.completedAt} is not null)`,
          totalCount: sql<number>`count(*)`,
        })
        .from(challengeProgress)
        .where(
          sql`${challengeProgress.enrollmentId} IN (${sql.join(
            enrollmentIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .groupBy(challengeProgress.enrollmentId);

      const completedMap = new Map(
        progressRows.map((r) => [r.enrollmentId, r.completedCount]),
      );
      const totalMap = new Map(
        progressRows.map((r) => [r.enrollmentId, r.totalCount]),
      );

      // Compute test score per enrollment (total passed test results)
      const testScoreRows = await ctx.db
        .select({
          enrollmentId: challengeTestResults.enrollmentId,
          passedCount: sql<number>`count(*) filter (where ${challengeTestResults.passed} = true)`,
        })
        .from(challengeTestResults)
        .where(
          sql`${challengeTestResults.enrollmentId} IN (${sql.join(
            enrollmentIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .groupBy(challengeTestResults.enrollmentId);

      const testScoreMap = new Map(
        testScoreRows.map((r) => [r.enrollmentId, r.passedCount]),
      );

      // Compute channel contributions (threads + replies) per user
      let contributionMap = new Map<string, number>();
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);

      if (channel) {
        // Count threads per user
        const threads = await ctx.db
          .select({ authorId: challengeThreads.authorId })
          .from(challengeThreads)
          .where(eq(challengeThreads.channelId, channel.id));

        const counts = new Map<string, number>();
        for (const t of threads) {
          counts.set(t.authorId, (counts.get(t.authorId) ?? 0) + 1);
        }

        // Count replies per user across all threads in the channel
        const replies = await ctx.db
          .select({ authorId: challengeReplies.authorId })
          .from(challengeReplies)
          .innerJoin(
            challengeThreads,
            eq(challengeReplies.threadId, challengeThreads.id),
          )
          .where(eq(challengeThreads.channelId, channel.id));

        for (const r of replies) {
          counts.set(r.authorId, (counts.get(r.authorId) ?? 0) + 1);
        }

        contributionMap = counts;
      }

      // Build ranked list based on ranking mode
      const ranked = enrollments
        .map((e) => ({
          ...e,
          completedObjectives: completedMap.get(e.enrollmentId) ?? 0,
          totalObjectives: totalMap.get(e.enrollmentId) ?? 0,
          testScore: testScoreMap.get(e.enrollmentId) ?? 0,
          channelContributions: contributionMap.get(e.userId) ?? 0,
        }))
        .sort((a, b) => {
          if (rankingMode === "speed") {
            // More completed objectives first, then earlier completion time
            if (b.completedObjectives !== a.completedObjectives) {
              return b.completedObjectives - a.completedObjectives;
            }
            if (a.completedAt && b.completedAt) {
              return (
                new Date(a.completedAt).getTime() -
                new Date(b.completedAt).getTime()
              );
            }
            if (a.completedAt) return -1;
            if (b.completedAt) return 1;
            return 0;
          }

          if (rankingMode === "thoroughness") {
            // Completion ratio first, then test score, then total completed
            const ratioA =
              a.totalObjectives > 0
                ? a.completedObjectives / a.totalObjectives
                : 0;
            const ratioB =
              b.totalObjectives > 0
                ? b.completedObjectives / b.totalObjectives
                : 0;
            if (ratioB !== ratioA) return ratioB - ratioA;
            if (b.testScore !== a.testScore) return b.testScore - a.testScore;
            if (b.completedObjectives !== a.completedObjectives) {
              return b.completedObjectives - a.completedObjectives;
            }
            return 0;
          }

          // collaboration: sort by channel contributions (threads + replies), then completed objectives
          if (b.channelContributions !== a.channelContributions) {
            return b.channelContributions - a.channelContributions;
          }
          if (b.completedObjectives !== a.completedObjectives) {
            return b.completedObjectives - a.completedObjectives;
          }
          return 0;
        })
        .slice(0, input.limit);

      // Enrich with member profile data
      const userIds = ranked.map((r) => r.userId);
      if (userIds.length === 0) return [];

      const profiles = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
        })
        .from(memberProfiles)
        .where(
          sql`${memberProfiles.userId} IN (${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      const users = await ctx.db
        .select({
          id: user.id,
          image: user.image,
          name: user.name,
        })
        .from(user)
        .where(
          sql`${user.id} IN (${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      const profileMap = new Map(profiles.map((p) => [p.userId, p]));
      const userMap = new Map(users.map((u) => [u.id, u]));

      return ranked.map((entry, index) => {
        const profile = profileMap.get(entry.userId);
        const u = userMap.get(entry.userId);
        return {
          rank: index + 1,
          userId: entry.userId,
          displayName: profile?.displayName ?? u?.name ?? "Anonymous",
          image: u?.image ?? null,
          completedObjectives: entry.completedObjectives,
          testScore: entry.testScore,
          channelContributions: entry.channelContributions,
          status: entry.status,
          completedAt: entry.completedAt,
        };
      });
    }),

  // ── Propose a community challenge ─────────────────────────────────────────

  propose: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(10).max(2000),
        type: z.enum(["weekly", "monthly"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();

      const slug = `${input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)}-${Date.now()}`;

      const challenge = await payload.create({
        collection: "challenges",
        data: {
          title: input.title,
          slug,
          description: {
            root: {
              type: "root",
              direction: "ltr" as const,
              format: "" as const,
              indent: 0,
              version: 1,
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [{ type: "text", text: input.description }],
                },
              ],
            },
          },
          type: input.type,
          status: "draft",
          difficulty: "beginner",
          publishedBy: "member",
          creatorId: userId,
          startsAt: new Date().toISOString(),
          endsAt: new Date().toISOString(),
          objectives: [
            {
              description: "TBD",
              verification: "platform-action" as const,
              action: "thread.create" as const,
              targetCount: 1,
            },
          ],
          rewards: {
            xpReward: calculateXpReward("beginner", [
              { verification: "platform-action" },
            ]),
          },
          maxParticipants: 0,
          proposedBy: userId,
        },
      });

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.proposed",
        targetType: "challenges",
        targetId: String(challenge.id),
        metadata: {
          title: input.title,
          collaborationModel: challenge.collaborationModel ?? undefined,
        },
      });

      return challenge;
    }),

  // ── Create a sponsor challenge ────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(200),
        slug: z.string().min(3).max(100),
        description: z.string().min(10).max(5000),
        type: z.enum(["weekly", "monthly", "open-ended"]),
        difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        repoTemplateUrl: z.string().url().optional(),
        repoTestCommand: z.string().optional(),
        repoConfigFile: z.boolean().optional(),
        repoColabUrl: z.string().url().optional(),
        objectives: z
          .array(
            z.object({
              description: z.string().min(1),
              verification: z.enum([
                "platform-action",
                "test",
                "self-report",
                "peer-review",
              ]),
              action: z.string().optional(),
              testPattern: z.string().optional(),
              targetCount: z.number().min(1).default(1),
              filter: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .min(1)
          .max(10),
        badgeReward: z.string().optional(),
        sponsorReward: z.string().optional(),
        maxParticipants: z.number().default(0),
        tags: z.array(z.string()).optional(),
        rankingMode: z
          .enum(["speed", "thoroughness", "collaboration"])
          .default("speed"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();

      const challenge = await payload.create({
        collection: "challenges",
        data: {
          title: input.title,
          slug: input.slug,
          description: {
            root: {
              type: "root",
              direction: "ltr" as const,
              format: "" as const,
              indent: 0,
              version: 1,
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [{ type: "text", text: input.description }],
                },
              ],
            },
          },
          type: input.type,
          status: "draft",
          difficulty: input.difficulty,
          publishedBy: "sponsor",
          creatorId: userId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          repo: {
            templateUrl: input.repoTemplateUrl,
            configFile: input.repoConfigFile ?? false,
            testCommand: input.repoTestCommand,
            colabUrl: input.repoColabUrl,
          },
          objectives: input.objectives.map((obj) => ({
            description: obj.description,
            verification: obj.verification,
            action: obj.action as
              | "thread.reply"
              | "thread.create"
              | "knowledge.share"
              | "idea.submitted"
              | "idea.voted"
              | undefined,
            testPattern: obj.testPattern,
            targetCount: obj.targetCount,
            filter: obj.filter,
          })),
          rewards: {
            xpReward: calculateXpReward(input.difficulty, input.objectives),
            badgeReward: input.badgeReward,
            sponsorReward: input.sponsorReward,
          },
          maxParticipants: input.maxParticipants,
          tags: input.tags,
          rankingMode: input.rankingMode,
        },
      });

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.created",
        targetType: "challenges",
        targetId: String(challenge.id),
        metadata: {
          title: input.title,
          collaborationModel: challenge.collaborationModel ?? undefined,
        },
      });

      return challenge;
    }),

  // ── Submit a solution ───────────────────────────────────────────────────

  submitSolution: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
        repoUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.status, "active"),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active enrollment not found",
        });
      }

      // Find challenge channel
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Challenge channel not found",
        });
      }

      // Create solution thread
      const [thread] = await ctx.db
        .insert(challengeThreads)
        .values({
          channelId: channel.id,
          type: "solution",
          authorId: userId,
          authorType: "member",
          title: input.title,
          content: input.content,
          metadata: input.repoUrl ? { repoUrl: input.repoUrl } : undefined,
        })
        .returning();

      // Run the enrollment update and the best-effort challenge fetch concurrently —
      // neither depends on the other, so their latencies overlap instead of stacking.
      const fetchChallengeBestEffort = async (): Promise<
        Challenge | undefined
      > => {
        try {
          const payloadForFetch = await getPayloadClient();
          return await payloadForFetch.findByID({
            collection: "challenges",
            id: input.challengeId,
            depth: 0,
          });
        } catch {
          // best-effort — instrumentation/email must not break solution submission
          return undefined;
        }
      };

      const [, fetchedChallenge] = await Promise.all([
        // Update enrollment
        ctx.db
          .update(challengeEnrollments)
          .set({ submittedAt: new Date() })
          .where(eq(challengeEnrollments.id, enrollment.id)),
        // Fetch challenge once for both activity instrumentation and email
        fetchChallengeBestEffort(),
      ]);

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.solution_submitted",
        targetType: "challenges",
        targetId: String(input.challengeId),
        communityId: fetchedChallenge?.communityId ?? undefined,
        collabSessionId: enrollment.progressLogThreadId ?? undefined,
        metadata: { title: input.title, templateBased: false },
      });

      // Send submission confirmation email (non-blocking)
      const userEmail = ctx.session.user.email;
      if (userEmail) {
        const displayName =
          ctx.session.user.name ?? userEmail.split("@")[0] ?? "there";
        void (async () => {
          if (!fetchedChallenge) return;
          await sendChallengeSubmissionConfirmation(
            userEmail,
            displayName,
            fetchedChallenge.title,
            fetchedChallenge.slug ?? String(input.challengeId),
          );
        })().catch(() => {
          /* non-blocking */
        });
      }

      return thread!;
    }),

  // ── Review a solution (peer-review objectives) ──────────────────────────

  reviewSolution: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        participantUserId: z.string(),
        objectiveIndex: z.number(),
        approved: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reviewerId = ctx.session.user.id;

      // Verify reviewer is the challenge creator
      const payload = await getPayloadClient();
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      if (challenge.creatorId !== reviewerId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the challenge creator can review solutions",
        });
      }

      // Find participant's enrollment
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, input.participantUserId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Enrollment not found",
        });
      }

      if (input.approved) {
        // Mark objective complete
        await ctx.db
          .update(challengeProgress)
          .set({
            completedAt: new Date(),
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            currentCount: 1,
          })
          .where(
            and(
              eq(challengeProgress.enrollmentId, enrollment.id),
              eq(challengeProgress.objectiveIndex, input.objectiveIndex),
              eq(challengeProgress.verificationMode, "peer-review"),
            ),
          );

        // Award solution approved XP
        await awardXp(
          ctx.db,
          input.participantUserId,
          XP_AMOUNTS.CHALLENGE_SOLUTION_APPROVED,
        );

        // Check if all objectives now complete
        await checkEnrollmentCompletion(
          ctx.db,
          enrollment.id,
          input.challengeId,
          input.participantUserId,
        );
      }

      await logActivity(ctx.db, {
        actorId: reviewerId,
        actorType: "member",
        action: input.approved
          ? "challenge.solution_approved"
          : "challenge.solution_rejected",
        targetType: "challenges",
        targetId: String(input.challengeId),
        collabSessionId: enrollment.progressLogThreadId ?? undefined,
        metadata: {
          participantUserId: input.participantUserId,
          objectiveIndex: input.objectiveIndex,
          editSignificance: input.approved ? "minor" : "rejection",
          collaborationModel: challenge.collaborationModel ?? undefined,
        },
      });

      return { success: true, approved: input.approved };
    }),

  // ── Get test results for an enrollment ──────────────────────────────────

  getTestResults: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, input.challengeId),
            eq(challengeEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (!enrollment) return [];

      return ctx.db
        .select()
        .from(challengeTestResults)
        .where(eq(challengeTestResults.enrollmentId, enrollment.id))
        .orderBy(desc(challengeTestResults.reportedAt));
    }),
});
