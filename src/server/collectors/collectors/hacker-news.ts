import { z } from "zod";
import type { Collector } from "../collector";
import {
  invalidSource,
  sourceJson,
  sourceText,
} from "../helpers/public-source";

const lists = ["top", "new", "ask", "show"] as const;
const inputSchema = z.object({
  list: z.enum(lists).default("top"),
  limit: z.number().int().min(1).max(50).default(20),
});
const itemSchema = z.object({
  title: z.string(),
  url: z.string(),
  points: z.number().nullable(),
  comments: z.number().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  discussionUrl: z.string(),
});
const idsSchema = z.array(z.number().int().positive());
const storySchema = z.object({
  id: z.number().int().positive(),
  type: z.literal("story"),
  title: z.string().trim().min(1),
  url: z.string().nullish(),
  score: z.number().int().nonnegative().nullish(),
  descendants: z.number().int().nonnegative().nullish(),
  by: z.string().nullish(),
  time: z.number().int().nonnegative().max(8_640_000_000_000).nullish(),
});
const API = "https://hacker-news.firebaseio.com/v0";

export function recognizeHackerNews(
  url: URL,
): { list: (typeof lists)[number] } | null {
  if (
    url.protocol !== "https:" ||
    url.hostname !== "news.ycombinator.com" ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  const paths: Record<string, (typeof lists)[number]> = {
    "/": "top",
    "/news": "top",
    "/newest": "new",
    "/ask": "ask",
    "/show": "show",
  };
  const list = paths[url.pathname];
  return list ? { list } : null;
}

function storyUrl(raw: string | null | undefined, discussion: string): string {
  try {
    const url = new URL(raw ?? "");
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : discussion;
  } catch {
    return discussion;
  }
}

export const hackerNews: Collector<
  z.infer<typeof inputSchema>,
  z.infer<typeof itemSchema>
> = {
  id: "hacker-news",
  version: 1,
  author: "platform",
  kind: "api",
  title: {
    en: "Hacker News stories",
    nl: "Hacker News-verhalen",
    fr: "Articles Hacker News",
  },
  description: {
    en: "Top, New, Ask or Show stories, with points, comments and discussion links.",
    nl: "Top-, New-, Ask- of Show-verhalen, met punten, reacties en discussielinks.",
    fr: "Articles Top, New, Ask ou Show, avec points, commentaires et liens de discussion.",
  },
  inputSchema,
  itemSchema,
  fieldHints: {
    list: {
      label: { en: "Story list", nl: "Verhalenlijst", fr: "Liste d’articles" },
    },
    limit: {
      label: {
        en: "Stories to collect",
        nl: "Aantal verhalen",
        fr: "Articles à collecter",
      },
      help: {
        en: "Up to 50. Unavailable or deleted stories are skipped and noted in the run log.",
        nl: "Maximaal 50. Niet-beschikbare of verwijderde verhalen worden overgeslagen en in het log vermeld.",
        fr: "Jusqu’à 50. Les articles indisponibles ou supprimés sont ignorés et signalés dans le journal.",
      },
    },
  },
  sampleItem: {
    title: "Show HN: A useful tool",
    url: "https://example.org/tool",
    points: 42,
    comments: 12,
    author: "builder",
    publishedAt: null,
    discussionUrl: "https://news.ycombinator.com/item?id=1",
  },
  limits: { maxPages: 55, maxItems: 50, maxDurationMs: 120_000 },
  async *run(input, ctx) {
    const parsed = idsSchema.safeParse(
      await sourceJson(
        await ctx.fetch(`${API}/${input.list}stories.json`, {
          accept: "application/json",
        }),
      ),
    );
    if (!parsed.success) throw invalidSource();
    const ids = [...new Set(parsed.data)].slice(0, input.limit);
    ctx.log(`Reading up to ${ids.length} stories from ${input.list}.`);
    let skipped = 0;
    for (const id of ids) {
      const response = await ctx.fetch(`${API}/item/${id}.json`, {
        accept: "application/json",
      });
      const raw = response.status === 404 ? null : await sourceJson(response);
      if (
        raw === null ||
        (typeof raw === "object" &&
          raw &&
          (("deleted" in raw && raw.deleted === true) ||
            ("dead" in raw && raw.dead === true) ||
            ("type" in raw && raw.type !== "story")))
      ) {
        skipped++;
        ctx.log(`Story ${id} is unavailable; skipped.`);
        continue;
      }
      const story = storySchema.safeParse(raw);
      if (!story.success || story.data.id !== id) throw invalidSource();
      const value = story.data;
      const discussionUrl = `https://news.ycombinator.com/item?id=${id}`;
      yield {
        title: value.title,
        url: storyUrl(value.url, discussionUrl),
        points: value.score ?? null,
        comments: value.descendants ?? null,
        author: sourceText(value.by),
        publishedAt:
          value.time == null ? null : new Date(value.time * 1000).toISOString(),
        discussionUrl,
      };
    }
    ctx.log(`Finished reading ${ids.length} story IDs; ${skipped} skipped.`);
  },
};
