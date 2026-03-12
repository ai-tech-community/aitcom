import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  benchmarkQuestions,
  benchmarkRuns,
  benchmarkAnswers,
  benchmarkVotes,
} from "@/server/db/schema";

// Shared enums — must match submit-question-form.tsx and agent endpoints
export const BENCHMARK_TOPICS = [
  "typescript",
  "llm-concepts",
  "mcp",
  "cloud-architecture",
  "ai-agents",
  "security",
  "open",
] as const;

export const BENCHMARK_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const benchmarkRouter = createTRPCRouter({
  getLeaderboard: publicProcedure
    .input(z.object({ topic: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.topic) {
        conditions.push(eq(benchmarkRuns.topicFilter, input.topic));
      }

      return ctx.db
        .select()
        .from(benchmarkRuns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(benchmarkRuns.scorePercent))
        .limit(50);
    }),

  getQuestionStats: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: benchmarkQuestions.id,
        question: benchmarkQuestions.question,
        topic: benchmarkQuestions.topic,
        difficulty: benchmarkQuestions.difficulty,
        contributorName: benchmarkQuestions.contributorName,
        explanation: benchmarkQuestions.explanation,
        totalAttempts: sql<number>`count(${benchmarkAnswers.id})`.as(
          "total_attempts",
        ),
        correctCount:
          sql<number>`count(${benchmarkAnswers.id}) filter (where ${benchmarkAnswers.isCorrect} = true)`.as(
            "correct_count",
          ),
      })
      .from(benchmarkQuestions)
      .leftJoin(
        benchmarkAnswers,
        eq(benchmarkAnswers.questionId, benchmarkQuestions.id),
      )
      .where(eq(benchmarkQuestions.status, "approved"))
      .groupBy(benchmarkQuestions.id);

    return rows.map((r) => ({
      ...r,
      accuracyPercent:
        r.totalAttempts > 0
          ? Math.round((r.correctCount / r.totalAttempts) * 100)
          : null,
    }));
  }),

  submitQuestion: protectedProcedure
    .input(
      z.object({
        question: z.string().min(10),
        correctAnswer: z.string().min(1),
        optionB: z.string().min(1),
        optionC: z.string().min(1),
        optionD: z.string().min(1),
        explanation: z.string().optional(),
        topic: z.enum(BENCHMARK_TOPICS),
        difficulty: z.enum(BENCHMARK_DIFFICULTIES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(benchmarkQuestions)
        .values({
          ...input,
          status: "pending",
          contributorId: ctx.session.user.id,
          contributorName: ctx.session.user.name ?? "member",
        })
        .returning();

      return row!;
    }),

  voteQuestion: protectedProcedure
    .input(
      z.object({
        questionId: z.string().uuid(),
        vote: z.enum(["up", "down"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check for duplicate vote — uniqueIndex enforces this at DB level but we
      // want a friendly error instead of a constraint violation
      const existing = await ctx.db
        .select({ id: benchmarkVotes.id })
        .from(benchmarkVotes)
        .where(
          and(
            eq(benchmarkVotes.userId, userId),
            eq(benchmarkVotes.questionId, input.questionId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have already voted on this question.",
        });
      }

      // Record vote + update counts + auto-approve/reject — all in one transaction
      return ctx.db.transaction(async (tx) => {
        await tx.insert(benchmarkVotes).values({
          questionId: input.questionId,
          userId,
          vote: input.vote,
        });

        const [updated] = await tx
          .update(benchmarkQuestions)
          .set(
            input.vote === "up"
              ? { upvotes: sql`${benchmarkQuestions.upvotes} + 1`, updatedAt: new Date() }
              : { downvotes: sql`${benchmarkQuestions.downvotes} + 1`, updatedAt: new Date() },
          )
          .where(eq(benchmarkQuestions.id, input.questionId))
          .returning();

        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Question not found." });
        }

        // Auto-approve / auto-reject based on thresholds
        if (updated.upvotes >= 3 && updated.status === "pending") {
          const [approved] = await tx
            .update(benchmarkQuestions)
            .set({ status: "approved", updatedAt: new Date() })
            .where(eq(benchmarkQuestions.id, input.questionId))
            .returning();
          return approved!;
        }

        if (updated.downvotes >= 2 && updated.status === "pending") {
          const [rejected] = await tx
            .update(benchmarkQuestions)
            .set({ status: "rejected", updatedAt: new Date() })
            .where(eq(benchmarkQuestions.id, input.questionId))
            .returning();
          return rejected!;
        }

        return updated;
      });
    }),
});
