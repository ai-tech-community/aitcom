import type { Where } from "payload";

import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";
import type { ForumThread } from "@/payload-types";
import { forumThreadCommunityWhere } from "@/server/communities/forum-scope";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemPickerSource, PickerSourceCandidate } from "../types";

export function forumThreadCandidate(
  thread: ForumThread,
): PickerSourceCandidate<InputOf<"forumThread">> {
  const facts: CandidateFact[] = [
    {
      type: "count",
      what: "replies",
      value: Number(thread.replyCount ?? 0),
    },
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
  };
}

export const forumThreadPicker: ItemPickerSource<InputOf<"forumThread">> = {
  async search(query, ctx, exclude) {
    const excludedIds = excludedNumericReferenceIds("forumThread", exclude);
    const and: Where[] = [
      ...(excludedIds.length ? [{ id: { not_in: excludedIds } }] : []),
      forumThreadCommunityWhere(ctx.community),
      { isDeleted: { not_equals: true } },
      ...(query ? [{ title: { like: query } }] : []),
    ];
    const { docs } = await ctx.deps.payload.find({
      collection: "forum-threads",
      where: { and },
      sort: "-lastActivityAt",
      depth: 0,
      locale: ctx.locale,
      limit: PICKER_LIMIT,
    });
    return docs.map(forumThreadCandidate);
  },
};
