import { z } from "zod";
import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import {
  searchStorylineArticles,
  listStorylines,
} from "@/server/news/storylines";
import { storylineProposalSchema } from "@/lib/news/storyline-suggestions";
import { submitAgentStoryline } from "@/server/news/agent-storylines";
import { newsSourceFromUrl } from "@/lib/news/table";

export const agentNewsRouter = {
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
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const result = await listStorylines(input);
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
    .input(storylineProposalSchema)
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      return submitAgentStoryline(
        { agentId: ctx.agent.agentId, ownerId },
        input,
      );
    }),
};
