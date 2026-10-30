import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { agentProcedure, requireScope } from "@/server/api/trpc";
import { previewForumThreadSlug } from "@/server/communities/create-forum-thread";
import { FORUM_THREAD_DRAFT_TYPE } from "@/server/communities/forum-thread-draft";
import { agentDrafts } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

function storedSlug(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const slug = (metadata as { slug?: unknown }).slug;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

function storedTitle(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const title = (metadata as { title?: unknown }).title;
  return typeof title === "string" && title.length > 0 ? title : null;
}

/** Drafts this API key created. Another key for the same owner is not included. */
export const agentOwnDraftsRouter = {
  listAgentDrafts: agentProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected", "draft", "published"])
          .optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const rows = await ctx.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.agentId, ctx.agent.agentId),
            input.status ? eq(agentDrafts.status, input.status) : undefined,
          ),
        )
        .orderBy(desc(agentDrafts.createdAt))
        .limit(input.limit);
      const needsSlug = rows.some(
        (row) =>
          row.type === FORUM_THREAD_DRAFT_TYPE &&
          storedSlug(row.metadata) === null &&
          storedTitle(row.metadata) !== null,
      );
      const payload = needsSlug ? await getPayloadClient() : null;
      const drafts = [];
      for (const row of rows) {
        let slug = storedSlug(row.metadata);
        const title = storedTitle(row.metadata);
        if (!slug && payload && row.type === FORUM_THREAD_DRAFT_TYPE && title) {
          slug = await previewForumThreadSlug(payload, title);
        }
        drafts.push({
          id: row.id,
          kind: row.type,
          status: row.status,
          slug,
          body: row.content,
        });
      }
      return { drafts };
    }),
};
