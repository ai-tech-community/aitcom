import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";

const challengeIdInputSchema = z.object({ challengeId: z.number() });
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import {
  challengeEnrollments,
  challengeProgress,
  memberProfiles,
  user,
} from "@/server/db/schema";
export const challengesRouter = createTRPCRouter({
  // ── List active + upcoming challenges ─────────────────────────────────────

  list: publicProcedure.query(async () => {
    const payload = await getPayloadClient();

    const { docs } = await payload.find({
      collection: "challenges",
      where: {
        status: { in: ["active"] },
      },
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

      // Create progress rows for each objective
      const objectives = Array.isArray(challenge.objectives)
        ? challenge.objectives
        : [];
      if (objectives.length > 0) {
        await ctx.db.insert(challengeProgress).values(
          objectives.map((_obj: unknown, index: number) => ({
            enrollmentId: enrollment.id,
            objectiveIndex: index,
            currentCount: 0,
          })),
        );
      }

      // Log activity
      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.enrolled",
        targetType: "challenges",
        targetId: String(challengeId),
        metadata: { title: challenge.title },
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
      try {
        const challenge = await payload.findByID({
          collection: "challenges",
          id: challengeId,
          depth: 0,
        });
        title = challenge.title;
      } catch {
        // use fallback title
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.abandoned",
        targetType: "challenges",
        targetId: String(challengeId),
        metadata: { title },
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
      // Get all enrollments for this challenge (non-abandoned)
      const enrollments = await ctx.db
        .select({
          enrollmentId: challengeEnrollments.id,
          userId: challengeEnrollments.userId,
          status: challengeEnrollments.status,
          completedAt: challengeEnrollments.completedAt,
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

      // Build ranked list: sort by completed objectives (desc), then completedAt time (asc, null last)
      const ranked = enrollments
        .map((e) => ({
          ...e,
          completedObjectives: completedMap.get(e.enrollmentId) ?? 0,
        }))
        .sort((a, b) => {
          // More completed objectives first
          if (b.completedObjectives !== a.completedObjectives) {
            return b.completedObjectives - a.completedObjectives;
          }
          // Earlier completion time wins
          if (a.completedAt && b.completedAt) {
            return (
              new Date(a.completedAt).getTime() -
              new Date(b.completedAt).getTime()
            );
          }
          // Completed before not-completed
          if (a.completedAt) return -1;
          if (b.completedAt) return 1;
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
          rewards: { xpReward: 0 },
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
        metadata: { title: input.title },
      });

      return challenge;
    }),
});
