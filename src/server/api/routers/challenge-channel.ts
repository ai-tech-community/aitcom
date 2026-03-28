import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  challengeChannels,
  challengeThreads,
  challengeReplies,
  challengeEnrollments,
  memberProfiles,
} from "@/server/db/schema";
import { logActivity } from "@/server/agent/activity";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { getPayloadClient } from "@/server/payload";

export const challengeChannelRouter = createTRPCRouter({
  /** Get channel metadata for a challenge */
  getChannel: publicProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, input.challengeId))
        .limit(1);
      return channel ?? null;
    }),

  /** List threads in a channel with optional type filter and cursor pagination */
  listThreads: publicProcedure
    .input(
      z.object({
        channelId: z.string(),
        type: z
          .enum([
            "announcement",
            "discussion",
            "question",
            "progress-log",
            "solution",
          ])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(challengeThreads.channelId, input.channelId)];
      if (input.type) {
        conditions.push(eq(challengeThreads.type, input.type));
      }
      if (input.cursor) {
        conditions.push(
          sql`${challengeThreads.createdAt} < ${new Date(input.cursor)}`,
        );
      }

      const threads = await ctx.db
        .select({
          id: challengeThreads.id,
          type: challengeThreads.type,
          authorId: challengeThreads.authorId,
          authorType: challengeThreads.authorType,
          title: challengeThreads.title,
          content: challengeThreads.content,
          isPinned: challengeThreads.isPinned,
          metadata: challengeThreads.metadata,
          createdAt: challengeThreads.createdAt,
          updatedAt: challengeThreads.updatedAt,
          authorName: memberProfiles.displayName,
        })
        .from(challengeThreads)
        .leftJoin(
          memberProfiles,
          eq(challengeThreads.authorId, memberProfiles.userId),
        )
        .where(and(...conditions))
        .orderBy(
          desc(challengeThreads.isPinned),
          desc(challengeThreads.createdAt),
        )
        .limit(input.limit + 1);

      const hasMore = threads.length > input.limit;
      const items = hasMore ? threads.slice(0, input.limit) : threads;
      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      return { threads: items, nextCursor };
    }),

  /** Get a thread with all its replies */
  getThread: publicProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [thread] = await ctx.db
        .select({
          id: challengeThreads.id,
          channelId: challengeThreads.channelId,
          type: challengeThreads.type,
          authorId: challengeThreads.authorId,
          authorType: challengeThreads.authorType,
          title: challengeThreads.title,
          content: challengeThreads.content,
          isPinned: challengeThreads.isPinned,
          metadata: challengeThreads.metadata,
          createdAt: challengeThreads.createdAt,
          updatedAt: challengeThreads.updatedAt,
          authorName: memberProfiles.displayName,
        })
        .from(challengeThreads)
        .leftJoin(
          memberProfiles,
          eq(challengeThreads.authorId, memberProfiles.userId),
        )
        .where(eq(challengeThreads.id, input.threadId))
        .limit(1);

      if (!thread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      const replies = await ctx.db
        .select({
          id: challengeReplies.id,
          authorId: challengeReplies.authorId,
          authorType: challengeReplies.authorType,
          content: challengeReplies.content,
          createdAt: challengeReplies.createdAt,
          authorName: memberProfiles.displayName,
        })
        .from(challengeReplies)
        .leftJoin(
          memberProfiles,
          eq(challengeReplies.authorId, memberProfiles.userId),
        )
        .where(eq(challengeReplies.threadId, input.threadId))
        .orderBy(asc(challengeReplies.createdAt));

      return { thread, replies };
    }),

  /** Create a new thread in a channel (must be enrolled) */
  createThread: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        type: z.enum(["discussion", "question", "solution"]),
        title: z.string().min(1).max(500),
        content: z.string().min(1).max(10000),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify channel exists
      const [channel] = await ctx.db
        .select()
        .from(challengeChannels)
        .where(eq(challengeChannels.id, input.channelId))
        .limit(1);

      if (!channel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Channel not found",
        });
      }

      // Verify user is enrolled
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, channel.challengeId),
            eq(challengeEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be enrolled to post",
        });
      }

      const [thread] = await ctx.db
        .insert(challengeThreads)
        .values({
          channelId: input.channelId,
          type: input.type,
          authorId: userId,
          authorType: "member",
          title: input.title,
          content: input.content,
          metadata: input.metadata,
        })
        .returning();

      await awardXp(ctx.db, userId, XP_AMOUNTS.CHALLENGE_CHANNEL_POST);

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "challenge.channel_post",
        targetType: "challenges",
        targetId: String(channel.challengeId),
        metadata: { threadType: input.type, title: input.title },
        collabSessionId: enrollment.progressLogThreadId ?? thread!.id,
      });

      return thread!;
    }),

  /** Reply to a thread in a challenge channel (must be enrolled) */
  replyToThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Fetch thread and its channel to determine challengeId
      const [threadWithChannel] = await ctx.db
        .select({
          channelId: challengeThreads.channelId,
          type: challengeThreads.type,
          challengeId: challengeChannels.challengeId,
        })
        .from(challengeThreads)
        .innerJoin(
          challengeChannels,
          eq(challengeThreads.channelId, challengeChannels.id),
        )
        .where(eq(challengeThreads.id, input.threadId))
        .limit(1);

      if (!threadWithChannel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      // Verify user is enrolled in the challenge
      const [enrollment] = await ctx.db
        .select()
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.challengeId, threadWithChannel.challengeId),
            eq(challengeEnrollments.userId, userId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Must be enrolled in the challenge to reply",
        });
      }

      const [reply] = await ctx.db
        .insert(challengeReplies)
        .values({
          threadId: input.threadId,
          authorId: userId,
          authorType: "member",
          content: input.content,
        })
        .returning();

      // Update thread updatedAt
      await ctx.db
        .update(challengeThreads)
        .set({ updatedAt: new Date() })
        .where(eq(challengeThreads.id, input.threadId));

      // Extra XP for answering questions
      if (threadWithChannel.type === "question") {
        await awardXp(ctx.db, userId, XP_AMOUNTS.CHALLENGE_ANSWER_QUESTION);
      } else {
        await awardXp(ctx.db, userId, XP_AMOUNTS.CHALLENGE_CHANNEL_POST);
      }

      return reply!;
    }),

  /** Pin or unpin a thread (challenge creator / sponsor only) */
  pinThread: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        isPinned: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Fetch thread → channel → challengeId
      const [threadWithChannel] = await ctx.db
        .select({
          channelId: challengeThreads.channelId,
          challengeId: challengeChannels.challengeId,
        })
        .from(challengeThreads)
        .innerJoin(
          challengeChannels,
          eq(challengeThreads.channelId, challengeChannels.id),
        )
        .where(eq(challengeThreads.id, input.threadId))
        .limit(1);

      if (!threadWithChannel) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Thread not found",
        });
      }

      // Verify the caller is the challenge creator or sponsor
      const payload = await getPayloadClient();
      let challenge;
      try {
        challenge = await payload.findByID({
          collection: "challenges",
          id: threadWithChannel.challengeId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Challenge not found",
        });
      }

      if (challenge.creatorId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the challenge creator can pin or unpin threads",
        });
      }

      await ctx.db
        .update(challengeThreads)
        .set({ isPinned: input.isPinned })
        .where(eq(challengeThreads.id, input.threadId));
      return { success: true };
    }),
});
