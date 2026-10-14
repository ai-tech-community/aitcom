import {
  listAgentStorylineDrafts,
  dismissAgentStorylineDraft,
} from "@/server/news/agent-storylines";
import {
  approveStorylineDraft,
  listPendingStorylineDrafts,
  readStorylineDraft,
} from "@/server/news/storyline-drafts";
import {
  castStorylineVote,
  StorylineVoteError,
} from "@/server/news/storyline-votes";
import { storylineDraftViewerRole } from "@/lib/news/storyline-draft-review";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  listStorylineResearch,
  readStorylineCoverage,
  reserveStorylineSchema,
} from "@/server/news/storyline-reservations";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { revalidateNewsTable } from "@/server/news/cache";
import { isNewsStaff } from "@/server/news/staff";
import {
  moderateNewsRumor,
  rumorDb,
  submitNewsRumor,
} from "@/server/news/rumors";
import { rumorInputSchema, submitterLabel } from "@/server/news/rumor-rules";
import {
  normalizeStorySuggestion,
  storySuggestionInputSchema,
} from "@/lib/news/story-suggestion";
import {
  listOpenStorySuggestions,
  reviewStorySuggestion,
  storySuggestionDb,
  submitStorySuggestion,
} from "@/server/news/story-suggestions";
import {
  claimWeeklyTopic,
  listMemberClaims,
  listWeeklyContributorBoard,
  storyCoverageToday,
  recordPublishedStoryCredit,
} from "@/server/news/contributions";

import { storylineInputSchema } from "@/lib/news/storylines";
import {
  findStoryline,
  listStorylines,
  saveStoryline,
  searchStorylineArticles,
  StorylineError,
} from "@/server/news/storylines";

const storylineStaffProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!(await isNewsStaff(ctx.session.user.email)))
      throw new TRPCError({ code: "FORBIDDEN" });
    return next();
  },
);

export const newsRouter = createTRPCRouter({
  listStorylineResearch: publicProcedure.query(() => listStorylineResearch()),
  storylineCoverage: publicProcedure
    .input(reserveStorylineSchema.pick({ topicKey: true }))
    .query(({ input }) => readStorylineCoverage(input.topicKey)),
  dismissAgentStorylineDraft: storylineStaffProcedure
    .input(z.object({ draftId: z.string().min(1).max(255) }))
    .mutation(({ input }) => dismissAgentStorylineDraft(input.draftId)),
  listAgentStorylineDrafts: storylineStaffProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(({ input }) => listAgentStorylineDrafts(input.page)),
  listMyStorylineDrafts: protectedProcedure.query(({ ctx }) =>
    listPendingStorylineDrafts({ ownerId: ctx.session.user.id }),
  ),
  listStorylineDraftQueue: storylineStaffProcedure.query(() =>
    listPendingStorylineDrafts(),
  ),
  readStorylineDraft: protectedProcedure
    .input(z.object({ draftId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const draft = await readStorylineDraft(input.draftId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      const staff = await isNewsStaff(ctx.session.user.email);
      const role = storylineDraftViewerRole({
        viewerId: ctx.session.user.id,
        ownerId: draft.ownerId,
        staff,
      });
      if (role !== "owner" && role !== "editor")
        throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...draft,
        canApprove: role === "editor" || role === "owner",
      };
    }),
  approveAgentStorylineDraft: protectedProcedure
    .input(z.object({ draftId: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const draft = await readStorylineDraft(input.draftId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      const staff = await isNewsStaff(ctx.session.user.email);
      if (!staff && draft.ownerId !== ctx.session.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      try {
        const saved = await approveStorylineDraft(
          input.draftId,
          ctx.session.user.id,
        );
        await recordPublishedStoryCredit(saved.id).catch(
          (creditErr: unknown) => {
            console.error("news: contribution credit failed", creditErr);
          },
        );
        return saved;
      } catch (err) {
        if (err instanceof StorylineError)
          throw new TRPCError({
            code: err.code === "conflict" ? "CONFLICT" : "BAD_REQUEST",
            message: err.message,
          });
        throw err;
      }
    }),
  castStorylineVote: protectedProcedure
    .input(
      z.object({
        storyId: z.string().trim().min(1).max(255),
        vote: z.enum(["up", "down", "clear"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await castStorylineVote({
          storyId: input.storyId,
          userId: ctx.session.user.id,
          vote: input.vote,
        });
      } catch (err) {
        if (err instanceof StorylineVoteError)
          throw new TRPCError({ code: "NOT_FOUND" });
        throw err;
      }
    }),
  listStorylines: storylineStaffProcedure
    .input(
      z.object({
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(({ input }) => listStorylines({ ...input, staff: true })),
  readStoryline: storylineStaffProcedure
    .input(z.object({ id: z.string().min(1).max(255) }))
    .query(({ input }) => findStoryline(input, true)),
  searchStorylineArticles: storylineStaffProcedure
    .input(
      z.object({
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(({ input }) => searchStorylineArticles(input.q, input.page)),
  saveStoryline: storylineStaffProcedure
    .input(storylineInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const saved = await saveStoryline(input, ctx.session.user.id);
        if (input.status === "published") {
          await recordPublishedStoryCredit(saved.id).catch(
            (creditErr: unknown) => {
              console.error("news: contribution credit failed", creditErr);
            },
          );
        }
        return saved;
      } catch (err) {
        if (err instanceof StorylineError)
          throw new TRPCError({
            code:
              err.code === "missing"
                ? "NOT_FOUND"
                : err.code === "conflict"
                  ? "CONFLICT"
                  : "BAD_REQUEST",
            message: err.message,
          });
        const cause =
          err instanceof Error
            ? (err as Error & { cause?: { code?: string }; code?: string })
            : null;
        if (cause?.code === "23505" || cause?.cause?.code === "23505")
          throw new TRPCError({ code: "CONFLICT", message: "slugTaken" });
        throw err;
      }
    }),
  submitRumor: protectedProcedure
    .input(rumorInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await submitNewsRumor(rumorDb, {
        userId: ctx.session.user.id,
        submitterName: submitterLabel(ctx.session.user),
        input,
        now: new Date(),
      });
      if (!result.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "rate",
        });
      }
      revalidateNewsTable();
      return { id: result.id };
    }),

  submitStorySuggestion: protectedProcedure
    .input(storySuggestionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const normalized = normalizeStorySuggestion(input.text);
      if (!normalized.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: normalized.reason,
        });
      }
      const result = await submitStorySuggestion(storySuggestionDb, {
        userId: ctx.session.user.id,
        value: normalized.value,
        now: new Date(),
      });
      if (!result.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "rate",
        });
      }
      return { id: result.id };
    }),

  storyCoverageToday: publicProcedure.query(() => storyCoverageToday()),
  myStoryClaims: protectedProcedure.query(({ ctx }) =>
    listMemberClaims(ctx.session.user.id),
  ),
  claimStoryTopic: protectedProcedure
    .input(
      z.object({
        topicKey: z.string().trim().min(2).max(100),
        title: z.string().trim().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await claimWeeklyTopic({
        userId: ctx.session.user.id,
        topicKey: input.topicKey,
        title: input.title,
      });
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "topic" });
      }
      return result;
    }),
  weeklyContributorBoard: publicProcedure.query(() =>
    listWeeklyContributorBoard(),
  ),

  listOpenStorySuggestions: storylineStaffProcedure.query(() =>
    listOpenStorySuggestions(),
  ),

  reviewStorySuggestion: storylineStaffProcedure
    .input(z.object({ id: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      const result = await reviewStorySuggestion(input.id, new Date());
      if (result === "missing") throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  moderateRumor: protectedProcedure
    .input(
      z.object({
        id: z.string().trim().min(1).max(255),
        action: z.enum(["hide", "show", "delete"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await isNewsStaff(ctx.session.user.email);
      const result = await moderateNewsRumor(rumorDb, {
        staff,
        action: input.action,
        id: input.id,
        now: new Date(),
      });
      if (result === "forbidden") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (result === "missing") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      revalidateNewsTable();
      return { ok: true as const };
    }),
});
