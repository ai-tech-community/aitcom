import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  benchmarkQuestions,
  benchmarkRuns,
  benchmarkAnswers,
} from "@/server/db/schema";

export const benchmarkRouter = createTRPCRouter({
  getLeaderboard: publicProcedure
    .input(z.object({ topic: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const query = ctx.db
        .select()
        .from(benchmarkRuns)
        .orderBy(desc(benchmarkRuns.scorePercent))
        .limit(50);

      if (input.topic) {
        return query.where(eq(benchmarkRuns.topicFilter, input.topic));
      }

      return query;
    }),

  getQuestionStats: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: benchmarkQuestions.id,
        question: benchmarkQuestions.question,
        topic: benchmarkQuestions.topic,
        difficulty: benchmarkQuestions.difficulty,
        totalAnswers: sql<number>`count(${benchmarkAnswers.id})`.as(
          "total_answers",
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
        r.totalAnswers > 0
          ? Math.round((r.correctCount / r.totalAnswers) * 100)
          : 0,
    }));
  }),

  submitQuestion: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1),
        correctAnswer: z.string().min(1),
        optionB: z.string().min(1),
        optionC: z.string().min(1),
        optionD: z.string().min(1),
        explanation: z.string().optional(),
        topic: z.enum([
          "reasoning",
          "knowledge",
          "coding",
          "safety",
          "creativity",
        ]),
        difficulty: z.enum(["easy", "medium", "hard"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(benchmarkQuestions)
        .values({
          question: input.question,
          correctAnswer: input.correctAnswer,
          optionB: input.optionB,
          optionC: input.optionC,
          optionD: input.optionD,
          explanation: input.explanation,
          topic: input.topic,
          difficulty: input.difficulty,
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
      const column =
        input.vote === "up"
          ? benchmarkQuestions.upvotes
          : benchmarkQuestions.downvotes;

      const [updated] = await ctx.db
        .update(benchmarkQuestions)
        .set({
          [input.vote === "up" ? "upvotes" : "downvotes"]: sql`${column} + 1`,
        })
        .where(eq(benchmarkQuestions.id, input.questionId))
        .returning();

      if (!updated) return updated;

      // Auto-approve/reject based on vote thresholds
      if (updated.upvotes >= 3 && updated.status !== "approved") {
        const [approved] = await ctx.db
          .update(benchmarkQuestions)
          .set({ status: "approved" })
          .where(eq(benchmarkQuestions.id, input.questionId))
          .returning();
        return approved!;
      }

      if (updated.downvotes >= 2 && updated.status !== "rejected") {
        const [rejected] = await ctx.db
          .update(benchmarkQuestions)
          .set({ status: "rejected" })
          .where(eq(benchmarkQuestions.id, input.questionId))
          .returning();
        return rejected!;
      }

      return updated;
    }),
});
