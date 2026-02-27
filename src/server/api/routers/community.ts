import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

async function requireRulesAcceptance(userId: string) {
  const payload = await getPayloadClient();
  const rules = await payload.findGlobal({ slug: "community-rules" });

  if (!rules.version) return;

  const { docs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  if (docs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}

export const communityRouter = createTRPCRouter({
  // ── Rules ──────────────────────────────────────────────────────────────────

  getRules: publicProcedure
    .input(z.object({ locale: z.enum(["en", "nl"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
    const payload = await getPayloadClient();
    const rules = await payload.findGlobal({
      slug: "community-rules",
      locale: input?.locale ?? "en",
    });

    const userId = ctx.session?.user?.id;
    let hasAccepted = false;
    let acceptedAt: string | null = null;

    if (userId && rules.version) {
      const { docs } = await payload.find({
        collection: "rules-acceptance",
        where: {
          and: [
            { userId: { equals: userId } },
            { rulesVersion: { equals: rules.version } },
          ],
        },
        limit: 1,
        depth: 0,
      });
      if (docs.length > 0) {
        hasAccepted = true;
        acceptedAt = docs[0]!.acceptedAt;
      }
    }

    return { ...rules, hasAccepted, acceptedAt };
  }),

  acceptRules: protectedProcedure.mutation(async ({ ctx }) => {
    const payload = await getPayloadClient();
    const rules = await payload.findGlobal({ slug: "community-rules" });

    if (!rules.version) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Community rules have not been published yet.",
      });
    }

    const { docs: existing } = await payload.find({
      collection: "rules-acceptance",
      where: {
        and: [
          { userId: { equals: ctx.session.user.id } },
          { rulesVersion: { equals: rules.version } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    if (existing.length > 0) {
      return { alreadyAccepted: true };
    }

    await payload.create({
      collection: "rules-acceptance",
      data: {
        userId: ctx.session.user.id,
        rulesVersion: rules.version,
        acceptedAt: new Date().toISOString(),
      },
    });

    return { alreadyAccepted: false };
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
        depth: 0,
      });

      const userId = ctx.session?.user?.id;

      if (userId) {
        const { docs: myVotes } = await payload.find({
          collection: "idea-votes",
          where: { voterId: { equals: userId } },
          limit: 200,
          depth: 0,
        });
        const votedIdeaIds = new Set(
          myVotes.map((v) =>
            typeof v.idea === "object" ? v.idea.id : v.idea,
          ),
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
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

      const idea = await payload.create({
        collection: "community-ideas",
        data: {
          title: input.title,
          description: input.description ?? undefined,
          authorId: ctx.session.user.id,
          authorName: userName,
          status: "open",
          voteCount: 0,
        },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "idea.submitted",
        targetType: "community-ideas",
        targetId: String(idea.id),
        metadata: { title: input.title },
      });

      return idea;
    }),

  toggleVote: protectedProcedure
    .input(z.object({ ideaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userId = ctx.session.user.id;

      const { docs: existingVotes } = await payload.find({
        collection: "idea-votes",
        where: {
          and: [
            { idea: { equals: input.ideaId } },
            { voterId: { equals: userId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      const idea = await payload.findByID({
        collection: "community-ideas",
        id: input.ideaId,
        depth: 0,
      });

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
            voterId: userId,
          },
        });
        await payload.update({
          collection: "community-ideas",
          id: input.ideaId,
          data: { voteCount: (idea.voteCount ?? 0) + 1 },
        });

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "idea.voted",
          targetType: "community-ideas",
          targetId: String(input.ideaId),
          metadata: { title: idea.title },
        });

        return { voted: true };
      }
    }),

  // ── Threads ────────────────────────────────────────────────────────────────

  getThreads: publicProcedure
    .input(
      z.object({
        category: z.enum(["all", "general", "question", "showcase", "job"]).default("all"),
        search: z.string().max(200).optional(),
        sort: z.enum(["newest", "mostReplied", "trending", "lastActive"]).default("newest"),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const conditions: Where[] = [];

      if (input.category !== "all") {
        conditions.push({ category: { equals: input.category } });
      }

      if (input.search) {
        conditions.push({
          or: [
            { title: { like: input.search } },
          ],
        });
      }

      const where = conditions.length > 0 ? { and: conditions } : undefined;

      const sortMap: Record<string, string> = {
        newest: "-createdAt",
        mostReplied: "-replyCount",
        trending: "-viewCount",
        lastActive: "-lastActivityAt",
      };

      const result = await payload.find({
        collection: "forum-threads",
        where,
        sort: `-isPinned,${sortMap[input.sort] ?? "-createdAt"}`,
        limit: input.limit,
        page: input.page,
        depth: 0,
      });

      return {
        threads: result.docs,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        page: result.page,
        hasNextPage: result.hasNextPage,
      };
    }),

  getThread: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const payload = await getPayloadClient();
      const result = await payload.find({
        collection: "forum-threads",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 0,
      });
      if (result.docs.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      }
      return result.docs[0]!;
    }),

  incrementViewCount: publicProcedure
    .input(z.object({ threadId: z.number() }))
    .mutation(async ({ input }) => {
      const payload = await getPayloadClient();
      const thread = await payload.findByID({
        collection: "forum-threads",
        id: input.threadId,
        depth: 0,
      });
      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: { viewCount: (thread.viewCount ?? 0) + 1 },
      });
      return { ok: true };
    }),

  createThread: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(255),
        content: z.any(),
        category: z.enum(["general", "question", "showcase", "job"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();
      const userName = ctx.session.user.name ?? "member";

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
          authorId: ctx.session.user.id,
          authorName: userName,
          authorRole: "member",
          isPinned: false,
          isLocked: false,
          replyCount: 0,
          lastActivityAt: new Date().toISOString(),
        },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "thread.create",
        targetType: "forum-threads",
        targetId: String(thread.id),
        metadata: { title: input.title, category: input.category, slug },
      });

      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FORUM_THREAD_CREATE);

      return thread;
    }),

  // ── Replies ────────────────────────────────────────────────────────────────

  addReply: protectedProcedure
    .input(
      z.object({
        threadId: z.number(),
        content: z.any(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRulesAcceptance(ctx.session.user.id);
      const payload = await getPayloadClient();

      const thread = await payload.findByID({
        collection: "forum-threads",
        id: input.threadId,
        depth: 0,
      });

      if (thread.isLocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This thread is locked",
        });
      }

      const reply = await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: input.content,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? "member",
          authorRole: "member",
        },
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "reply.create",
        targetType: "forum-threads",
        targetId: String(input.threadId),
        metadata: {
          threadTitle: thread.title,
          threadSlug: thread.slug,
          threadAuthorId: thread.authorId,
        },
      });

      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FORUM_REPLY_CREATE);

      // Award XP to thread author for receiving a reply
      if (thread.authorId !== ctx.session.user.id) {
        await awardXp(ctx.db, thread.authorId, XP_AMOUNTS.FORUM_RECEIVE_REPLY);
      }

      return reply;
    }),

  getReplies: publicProcedure
    .input(
      z.object({
        threadId: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "forum-replies",
        where: { thread: { equals: input.threadId } },
        sort: "createdAt",
        limit: 200,
        depth: 0,
      });

      return docs;
    }),

  // ── Admin ─────────────────────────────────────────────────────────────────

  pinThread: protectedProcedure
    .input(z.object({ threadId: z.number(), isPinned: z.boolean() }))
    .mutation(async ({ input }) => {
      const payload = await getPayloadClient();
      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: { isPinned: input.isPinned },
      });
      return { ok: true };
    }),

  lockThread: protectedProcedure
    .input(z.object({ threadId: z.number(), isLocked: z.boolean() }))
    .mutation(async ({ input }) => {
      const payload = await getPayloadClient();
      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: { isLocked: input.isLocked },
      });
      return { ok: true };
    }),
});
