import type { CandidateFact } from "@/lib/magazines/picker";
import { forumThreadCommunityWhere } from "@/server/communities/forum-scope";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";

export const forumThreadSuggester: ItemSuggestionSource<
  InputOf<"forumThread">
> = {
  async suggest(ctx, window, config) {
    if (config.limit <= 0) return [];
    const exclude = excludedNumericReferenceIds("forumThread", config.exclude);
    const { docs } = await ctx.deps.payload.find({
      collection: "forum-threads",
      where: {
        and: [
          forumThreadCommunityWhere(ctx.community),
          { isDeleted: { not_equals: true } },
          {
            lastActivityAt: {
              greater_than_equal: window.since.toISOString(),
              less_than_equal: window.until.toISOString(),
            },
          },
          ...(exclude.length ? [{ id: { not_in: exclude } }] : []),
        ],
      },
      sort: ["-replyCount", "-viewCount", "id"],
      depth: 0,
      locale: ctx.locale,
      limit: config.limit,
    });
    return docs.map((thread) => {
      const count = Number(thread.replyCount ?? 0);
      const facts: CandidateFact[] = [
        { type: "count", what: "replies", value: count },
      ];
      if (thread.lastActivityAt)
        facts.push({
          type: "date",
          label: "lastActive",
          at: thread.lastActivityAt,
        });
      if (thread.authorName)
        facts.push({ type: "byline", name: thread.authorName });
      return {
        input: { kind: "forumThread", threadId: Number(thread.id) },
        title: thread.title,
        facts,
        openHref: null,
        reason: { type: "mostReplies", count },
      };
    });
  },
};
