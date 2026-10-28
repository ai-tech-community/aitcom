import { z } from "zod";
import { eq } from "drizzle-orm";

import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import { createForumThread } from "@/server/communities/create-forum-thread";
import {
  FORUM_THREAD_CATEGORIES,
  FORUM_THREAD_CONTENT_MAX,
  FORUM_THREAD_TITLE_MAX,
  FORUM_THREAD_TITLE_MIN,
} from "@/server/communities/forum-thread-draft";
import { pinForumThread } from "@/server/communities/pin-forum-thread";
import { user } from "@/server/db/schema";

/**
 * Forum writes an agent makes as its owner. Validation matches the forum
 * form. Pinning matches the pin control: community owner, admin, or moderator.
 */
export const agentForumRouter = {
  createThread: agentProcedure
    .input(
      z.object({
        title: z
          .string()
          .min(FORUM_THREAD_TITLE_MIN)
          .max(FORUM_THREAD_TITLE_MAX),
        content: z.string().min(1).max(FORUM_THREAD_CONTENT_MAX),
        category: z.enum(FORUM_THREAD_CATEGORIES).default("general"),
        communitySlug: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const owner = await ctx.db.query.user.findFirst({
        where: eq(user.id, ownerId),
        columns: { name: true },
      });
      const thread = await createForumThread(
        ctx.db,
        { id: ctx.agent.agentId, type: "agent" },
        { id: ownerId, name: owner?.name ?? "member" },
        input,
      );
      return {
        id: thread.id,
        slug: thread.slug,
        title: thread.title,
        category: thread.category,
        communityId: thread.communityId ?? null,
      };
    }),

  pinThread: agentProcedure
    .input(
      z.object({
        threadId: z.number().int().positive(),
        isPinned: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      return pinForumThread(ctx.db, ownerId, input, { allowHubThread: false });
    }),
};
