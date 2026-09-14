import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  AWESOME_AI_OSS_BLURB_MAX,
  AWESOME_CATEGORY_IDS,
  type AwesomePublicCard,
} from "@/lib/investigations/awesome-ai-oss";
import {
  AWESOME_REPO_DUPLICATE_ERROR,
  AWESOME_REPO_URL_ERROR,
  parseAwesomeRepoUrl,
} from "@/lib/investigations/awesome-ai-oss-url";
import {
  findApprovedProject,
  findProjectByRepoUrl,
  listApprovedPublicCards,
  loadAwesomeSessionState,
} from "@/server/awesome-ai-oss/queries";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  requireHubOperator,
} from "@/server/api/trpc";
import {
  awesomeAiOssProjects,
  awesomeAiOssSaves,
  awesomeAiOssVotes,
} from "@/server/db/schema";

const categorySchema = z.enum(AWESOME_CATEGORY_IDS);

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export const awesomeAiOssRouter = createTRPCRouter({
  /** Approved cards only. Never includes vote counts or pending rows. */
  listApproved: publicProcedure.query(
    async (): Promise<AwesomePublicCard[]> => {
      return listApprovedPublicCards();
    },
  ),

  sessionState: protectedProcedure.query(async ({ ctx }) => {
    const cards = await listApprovedPublicCards();
    return loadAwesomeSessionState(
      ctx.session.user.id,
      cards.map((card) => card.id),
    );
  }),

  submit: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        repoUrl: z.string().trim().min(1).max(500),
        category: categorySchema,
        blurb: z.string().trim().min(1).max(AWESOME_AI_OSS_BLURB_MAX),
        reviewerNote: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parsed = parseAwesomeRepoUrl(input.repoUrl);
      if (!parsed.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: AWESOME_REPO_URL_ERROR,
        });
      }

      const existing = await findProjectByRepoUrl(parsed.value.normalized);
      if (existing) {
        if (existing.status === "rejected") {
          const [updated] = await ctx.db
            .update(awesomeAiOssProjects)
            .set({
              name: input.name,
              category: input.category,
              blurbEn: input.blurb,
              blurbNl: input.blurb,
              status: "pending",
              source: "member",
              reviewerNote: input.reviewerNote ?? null,
              rejectionReason: null,
              submittedByUserId: ctx.session.user.id,
              reviewedByUserId: null,
              reviewedAt: null,
              addedOn: null,
            })
            .where(eq(awesomeAiOssProjects.id, existing.id))
            .returning({ id: awesomeAiOssProjects.id });
          return { id: updated!.id, status: "pending" as const };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: AWESOME_REPO_DUPLICATE_ERROR,
        });
      }

      const [created] = await ctx.db
        .insert(awesomeAiOssProjects)
        .values({
          name: input.name,
          repoUrl: parsed.value.normalized,
          repoHost: parsed.value.host,
          category: input.category,
          blurbEn: input.blurb,
          blurbNl: input.blurb,
          status: "pending",
          source: "member",
          reviewerNote: input.reviewerNote ?? null,
          submittedByUserId: ctx.session.user.id,
        })
        .returning({ id: awesomeAiOssProjects.id });

      return { id: created!.id, status: "pending" as const };
    }),

  vote: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const project = await findApprovedProject(input.projectId);
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const [existing] = await ctx.db
        .select({ id: awesomeAiOssVotes.id })
        .from(awesomeAiOssVotes)
        .where(
          and(
            eq(awesomeAiOssVotes.projectId, input.projectId),
            eq(awesomeAiOssVotes.voterId, ctx.session.user.id),
          ),
        )
        .limit(1);

      if (existing) {
        await ctx.db
          .delete(awesomeAiOssVotes)
          .where(eq(awesomeAiOssVotes.id, existing.id));
        return { voted: false };
      }

      await ctx.db.insert(awesomeAiOssVotes).values({
        projectId: input.projectId,
        voterId: ctx.session.user.id,
      });
      return { voted: true };
    }),

  save: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const project = await findApprovedProject(input.projectId);
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const [existing] = await ctx.db
        .select({ id: awesomeAiOssSaves.id })
        .from(awesomeAiOssSaves)
        .where(
          and(
            eq(awesomeAiOssSaves.projectId, input.projectId),
            eq(awesomeAiOssSaves.userId, ctx.session.user.id),
          ),
        )
        .limit(1);

      if (existing) {
        await ctx.db
          .delete(awesomeAiOssSaves)
          .where(eq(awesomeAiOssSaves.id, existing.id));
        return { saved: false };
      }

      await ctx.db.insert(awesomeAiOssSaves).values({
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });
      return { saved: true };
    }),

  pendingQueue: protectedProcedure.query(async ({ ctx }) => {
    await requireHubOperator(ctx);
    return ctx.db
      .select({
        id: awesomeAiOssProjects.id,
        name: awesomeAiOssProjects.name,
        repoUrl: awesomeAiOssProjects.repoUrl,
        category: awesomeAiOssProjects.category,
        blurbEn: awesomeAiOssProjects.blurbEn,
        reviewerNote: awesomeAiOssProjects.reviewerNote,
        submittedByUserId: awesomeAiOssProjects.submittedByUserId,
        createdAt: awesomeAiOssProjects.createdAt,
      })
      .from(awesomeAiOssProjects)
      .where(eq(awesomeAiOssProjects.status, "pending"))
      .orderBy(desc(awesomeAiOssProjects.createdAt));
  }),

  moderate: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        action: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireHubOperator(ctx);

      const [project] = await ctx.db
        .select()
        .from(awesomeAiOssProjects)
        .where(eq(awesomeAiOssProjects.id, input.projectId))
        .limit(1);
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (project.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending submissions can be moderated.",
        });
      }

      if (input.action === "approve") {
        await ctx.db
          .update(awesomeAiOssProjects)
          .set({
            status: "approved",
            addedOn: todayIsoDate(),
            reviewedByUserId: ctx.session.user.id,
            reviewedAt: new Date(),
            rejectionReason: null,
          })
          .where(eq(awesomeAiOssProjects.id, input.projectId));
        return { status: "approved" as const };
      }

      await ctx.db
        .update(awesomeAiOssProjects)
        .set({
          status: "rejected",
          rejectionReason: input.reason ?? null,
          reviewedByUserId: ctx.session.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(awesomeAiOssProjects.id, input.projectId));
      return { status: "rejected" as const };
    }),
});
