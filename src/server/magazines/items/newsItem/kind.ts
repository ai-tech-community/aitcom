import { z } from "zod";

import type { UnavailableItem } from "@/lib/magazines/item-views";
import { newsItemInputReference } from "@/lib/magazines/references";
import { findNewsItemsByIds, type NewsListItem } from "@/server/news/list";

import {
  cutWords,
  introInput,
  itemBaseInput,
  storedIntro,
} from "../base-input";
import { itemIdOf } from "../item-id";
import { validateReferences } from "../references";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";
import { newsItemSource } from "./source";

const newsItemInput = z.object({
  kind: z.literal("newsItem"),
  ...itemBaseInput,
  newsItemId: z.string().min(1).max(255),
});

type NewsItemInput = z.infer<typeof newsItemInput>;
type NewsItemStored = StoredItem<"newsItem">;

/** News is global and public for every current issue access level. */
function newsFor(
  items: NewsItemStored[],
  ctx: ItemContext,
): Promise<Map<string, NewsListItem>> {
  switch (ctx.access) {
    case "teaser":
    case "full":
    case "editor":
      return findNewsItemsByIds(
        items.map((item) => item.newsItemId),
        ctx.db,
      );
  }
}

const referenceOf = newsItemInputReference;

export const newsItemKind: IssueItemKind<
  "newsItem",
  NewsItemInput,
  NewsItemStored
> = {
  kind: "newsItem",
  input: newsItemInput,
  toStored: (input) => ({
    intro: storedIntro(input.intro),
    newsItemId: input.newsItemId,
  }),
  toInput: (stored) => ({
    kind: "newsItem",
    ...(stored.id ? { id: stored.id } : {}),
    newsItemId: stored.newsItemId,
    ...introInput(stored.intro),
  }),
  referenceOf,
  async validate(items, ctx) {
    const found = await findNewsItemsByIds(
      items.map((item) => item.stored.newsItemId),
      ctx.db,
    );
    return validateReferences(items, {
      referenceOf,
      acceptNew: (stored) => found.has(stored.newsItemId),
    });
  },
  async load(items, ctx) {
    const found = await newsFor(items, ctx);
    const views = new Map<string, ItemViewOf<"newsItem"> | UnavailableItem>();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      const news = found.get(stored.newsItemId);
      if (!news) {
        views.set(itemId, {
          kind: "newsItem",
          itemId,
          unavailable: true,
          reason: "missing",
        });
      } else {
        views.set(itemId, {
          kind: "newsItem",
          itemId,
          intro: stored.intro ?? null,
          news: {
            ...newsItemSource(news.url),
            title: news.title,
            publishedAt: news.publishedAt?.toISOString() ?? null,
            // Empty or whitespace-only AI text should use the feed summary too.
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            summary: cutWords(news.aiSummary?.trim() || news.summary, 30),
          },
        });
      }
    }
    return views;
  },
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "teaser":
      case "full":
      case "editor":
        return true;
    }
  },
};
