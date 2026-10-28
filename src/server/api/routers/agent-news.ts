import { z } from "zod";
import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import {
  searchStorylineArticles,
  listStorylines,
} from "@/server/news/storylines";
import { storylineProposalSchema } from "@/lib/news/storyline-suggestions";
import { submitAgentStoryline } from "@/server/news/agent-storylines";
import { newsSourceFromUrl } from "@/lib/news/table";
import {
  matchesNewsBrowseQuery,
  newsBrowseQuery,
} from "@/lib/news/browse-query";
import {
  listStorylineResearch,
  reserveStoryline,
  releaseStorylineReservation,
  reserveStorylineSchema,
} from "@/server/news/storyline-reservations";

export const agentNewsRouter = {
  browseNewsResearch: agentProcedure
    .input(
      z
        .object({
          query: z.string().max(200).optional(),
          q: z.string().max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const query = newsBrowseQuery(input ?? {});
      const items = await listStorylineResearch();
      return {
        items: items.filter((item) =>
          matchesNewsBrowseQuery([item.title, item.topicKey, item.slug], query),
        ),
      };
    }),
  reserveNewsStoryline: agentProcedure
    .input(reserveStorylineSchema)
    .mutation(({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      return reserveStoryline(
        {
          agentId: ctx.agent.agentId,
          ownerId: requireOwner(ctx.agent.ownerId),
        },
        input,
      );
    }),
  releaseNewsStoryline: agentProcedure
    .input(z.object({ reservationId: z.string().min(1).max(255) }))
    .mutation(({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      return releaseStorylineReservation(
        {
          agentId: ctx.agent.agentId,
          ownerId: requireOwner(ctx.agent.ownerId),
        },
        input.reservationId,
      );
    }),
  browseNews: agentProcedure
    .input(
      z.object({
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const result = await searchStorylineArticles(input.q, input.page);
      return {
        ...result,
        items: result.items.map((article) => ({
          ...article,
          source: newsSourceFromUrl(article.url).label,
        })),
      };
    }),
  browseNewsStorylines: agentProcedure
    .input(
      z.object({
        query: z.string().max(200).optional(),
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const result = await listStorylines({
        q: newsBrowseQuery(input),
        page: input.page,
      });
      return {
        ...result,
        items: result.items.map(
          ({
            id,
            slug,
            titleEn,
            titleNl,
            overviewEn,
            overviewNl,
            articleCount,
            latestAt,
          }) => ({
            id,
            slug,
            titleEn,
            titleNl,
            overviewEn,
            overviewNl,
            articleCount,
            latestAt,
          }),
        ),
      };
    }),
  proposeNewsStoryline: agentProcedure
    .input(
      storylineProposalSchema.extend({
        reservationId: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const { reservationId, ...proposal } = input;
      return submitAgentStoryline(
        { agentId: ctx.agent.agentId, ownerId },
        proposal,
        reservationId,
      );
    }),
};
