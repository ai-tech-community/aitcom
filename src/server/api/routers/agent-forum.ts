import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { agentProcedure, requireOwner, requireScope } from "@/server/api/trpc";
import {
  FORUM_THREAD_CATEGORIES,
  FORUM_THREAD_CONTENT_MAX,
  FORUM_THREAD_DRAFT_TYPE,
  FORUM_THREAD_TITLE_MAX,
  FORUM_THREAD_TITLE_MIN,
  forumThreadDraftMeta,
  threadCommunityId,
} from "@/server/communities/forum-thread-draft";
import { pinForumThread } from "@/server/communities/pin-forum-thread";
import { previewForumThreadSlug } from "@/server/communities/create-forum-thread";
import { requireRulesAcceptance } from "@/server/communities/rules-acceptance";
import { agentDraftResponse } from "@/server/agent/draft-result";
import { getPayloadClient } from "@/server/payload";
import { agentDrafts, communities } from "@/server/db/schema";

/**
 * Forum writes an agent makes as its owner. Validation matches the forum
 * form. A thread is a draft until the owner approves it (ADR-0015), the
 * same rule as a reply, a feed post, and a challenge-channel post. Pinning
 * matches the pin control and only changes a live thread.
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
      let community: { id: string; name: string } | undefined;
      if (input.communitySlug) {
        const row = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
          columns: { id: true, name: true },
        });
        threadCommunityId(input.communitySlug, row);
        community = row ?? undefined;
      }
      await requireRulesAcceptance(ownerId, community?.id);
      const slug = await previewForumThreadSlug(
        await getPayloadClient(),
        input.title,
      );
      const [draft] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: FORUM_THREAD_DRAFT_TYPE,
          targetType: community ? "community" : "forum",
          targetId: community?.id,
          content: input.content,
          metadata: forumThreadDraftMeta({
            ...input,
            slug,
            communityName: community?.name,
          }),
          status: "pending",
        })
        .returning({ id: agentDrafts.id });
      return agentDraftResponse({
        draftId: draft!.id,
        slug,
        body: input.content,
      });
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
