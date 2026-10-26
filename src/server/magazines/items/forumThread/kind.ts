import { z } from "zod";

import type { UnavailableItem } from "@/lib/magazines/item-views";
import { itemReference } from "@/lib/magazines/references";
import {
  forumThreadMatchesCommunity,
  forumThreadSitemapPath,
} from "@/server/communities/forum-scope";

import { introInput, itemBaseInput, storedIntro } from "../base-input";
import { loadCommunityContentRule } from "../community-content";
import { itemIdOf } from "../item-id";
import { validateReferences } from "../references";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";

const threadInput = z.object({
  kind: z.literal("forumThread"),
  ...itemBaseInput,
  threadId: z.number().int().positive(),
});
type ThreadInput = z.infer<typeof threadInput>;
type ThreadStored = StoredItem<"forumThread">;

async function loadThreads(items: ThreadStored[], ctx: ItemContext) {
  const { docs } = await ctx.payload.find({
    collection: "forum-threads",
    where: { id: { in: items.map((item) => Number(item.threadId)) } },
    depth: 0,
    locale: ctx.locale,
    pagination: false,
  });
  return new Map(docs.map((thread) => [Number(thread.id), thread]));
}

const referenceOf = (stored: ThreadStored) =>
  itemReference("forumThread", Number(stored.threadId));

export const forumThreadItemKind: IssueItemKind<
  "forumThread",
  ThreadInput,
  ThreadStored
> = {
  kind: "forumThread",
  input: threadInput,
  toStored: (input) => ({
    intro: storedIntro(input.intro),
    threadId: input.threadId,
  }),
  toInput: (stored) => ({
    kind: "forumThread",
    ...(stored.id ? { id: stored.id } : {}),
    threadId: Number(stored.threadId),
    ...introInput(stored.intro),
  }),
  referenceOf,
  async validate(items, ctx) {
    const [threads, rule] = await Promise.all([
      loadThreads(
        items.map((item) => item.stored),
        ctx,
      ),
      loadCommunityContentRule(ctx.reader, ctx.access),
    ]);
    return validateReferences(items, {
      referenceOf,
      acceptNew: (stored) => {
        const thread = threads.get(Number(stored.threadId));
        return (
          !!thread &&
          !thread.isDeleted &&
          forumThreadMatchesCommunity(thread.communityId, ctx.community) &&
          rule.readable(thread.communityId)
        );
      },
    });
  },
  async load(items, ctx) {
    const [threads, rule] = await Promise.all([
      loadThreads(items, ctx),
      loadCommunityContentRule(ctx.reader, ctx.access),
    ]);
    const views = new Map<
      string,
      ItemViewOf<"forumThread"> | UnavailableItem
    >();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      const thread = threads.get(Number(stored.threadId));
      const unavailable = (reason: UnavailableItem["reason"]) =>
        views.set(itemId, {
          kind: "forumThread",
          itemId,
          unavailable: true,
          reason,
        });
      const path = thread
        ? forumThreadSitemapPath(
            thread,
            new Map([[ctx.community.id, ctx.community.slug]]),
          )
        : null;
      if (!thread || thread.isDeleted || !path) unavailable("missing");
      else if (!rule.readable(thread.communityId)) unavailable("no_access");
      else
        views.set(itemId, {
          kind: "forumThread",
          itemId,
          intro: stored.intro ?? null,
          membersOnly: rule.membersOnly(thread.communityId),
          thread: {
            path,
            title: thread.title,
            replyCount: Number(thread.replyCount ?? 0),
            authorName: thread.authorName ?? null,
            lastActivityAt: thread.lastActivityAt ?? null,
          },
        });
    }
    return views;
  },
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "full":
      case "editor":
        return true;
    }
  },
};
