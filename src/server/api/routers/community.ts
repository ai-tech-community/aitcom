import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import type { CommunityIdea, IdeaVote } from "@/payload-types";

export const communityRouter = createTRPCRouter({
  // ── Rules ──────────────────────────────────────────────────────────────────

  getRules: publicProcedure.query(async () => {
    const payload = await getPayloadClient();
    const rules = await payload.findGlobal({ slug: "community-rules" });
    return rules;
  }),

  // ── Ideas ──────────────────────────────────────────────────────────────────

  getIdeas: publicProcedure
    .input(
      z.object({
        sort: z.enum(["votes", "recent"]).default("votes"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "community-ideas",
        sort: input.sort === "votes" ? "-voteCount" : "-createdAt",
        limit: 50,
        depth: 1,
      });

      const userId = ctx.session?.user?.id;

      if (userId) {
        const { docs: myVotes } = await payload.find({
          collection: "idea-votes",
          where: { voter: { equals: userId } },
          limit: 200,
          depth: 0,
        });
        const votedIdeaIds = new Set(
          myVotes.map((v) => {
            const vote = v as IdeaVote;
            return typeof vote.idea === "object" ? vote.idea.id : vote.idea;
          }),
        );
        return docs.map((idea) => ({
          ...idea,
          hasVoted: votedIdeaIds.has(idea.id),
        }));
      }

      return docs.map((idea) => ({ ...idea, hasVoted: false }));
    }),

  submitIdea: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const idea = await payload.create({
        collection: "community-ideas",
        data: {
          title: input.title,
          description: input.description ?? undefined,
          author: ctx.session.user.id as unknown as number,
          status: "open",
          voteCount: 0,
        },
      });

      return idea;
    }),

  toggleVote: protectedProcedure
    .input(z.object({ ideaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const { docs: existingVotes } = await payload.find({
        collection: "idea-votes",
        where: {
          and: [
            { idea: { equals: input.ideaId } },
            { voter: { equals: userId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      const idea = (await payload.findByID({
        collection: "community-ideas",
        id: input.ideaId,
        depth: 0,
      })) as CommunityIdea;

      if (existingVotes.length > 0) {
        await payload.delete({
          collection: "idea-votes",
          id: existingVotes[0]!.id,
        });
        await payload.update({
          collection: "community-ideas",
          id: input.ideaId,
          data: { voteCount: Math.max(0, (idea.voteCount ?? 0) - 1) },
        });
        return { voted: false };
      } else {
        await payload.create({
          collection: "idea-votes",
          data: {
            idea: input.ideaId,
            voter: userId as unknown as number,
          },
        });
        await payload.update({
          collection: "community-ideas",
          id: input.ideaId,
          data: { voteCount: (idea.voteCount ?? 0) + 1 },
        });
        return { voted: true };
      }
    }),

  // ── Threads ────────────────────────────────────────────────────────────────

  getThreads: publicProcedure
    .input(
      z.object({
        category: z
          .enum(["all", "general", "question", "showcase", "job"])
          .default("all"),
      }),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const where =
        input.category === "all"
          ? undefined
          : { category: { equals: input.category } };

      const { docs } = await payload.find({
        collection: "forum-threads",
        where,
        sort: "-isPinned,-lastActivityAt",
        limit: 30,
        depth: 1,
      });

      return docs;
    }),

  createThread: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(255),
        content: z.string().min(10).max(10000),
        category: z.enum(["general", "question", "showcase", "job"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const thread = await payload.create({
        collection: "forum-threads",
        data: {
          title: input.title,
          slug,
          content: input.content,
          category: input.category,
          author: ctx.session.user.id as unknown as number,
          isPinned: false,
          isLocked: false,
          replyCount: 0,
          lastActivityAt: new Date().toISOString(),
        },
      });

      return thread;
    }),
});
