import { forumThreadCommunityWhere } from "@/server/communities/forum-scope";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { forumThreadCandidate } from "./picker";

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
    return docs.map((thread) => ({
      ...forumThreadCandidate(thread),
      reason: { type: "mostReplies", count: Number(thread.replyCount ?? 0) },
    }));
  },
};
