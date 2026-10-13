import { unstable_cache } from "next/cache";

import {
  NEWS_MEMBER_SOURCE,
  newsSourceFromUrl,
  newsTableWriter,
  type NewsTableQuery,
} from "@/lib/news/table";
import { db } from "@/server/db";

import { NEWS_TABLE_CACHE_TAG } from "./cache";

import type { NewsListItem } from "./list";
import type { NewsRumorItem } from "./rumors";
import {
  newsTableCountSql,
  newsTableFacetSql,
  newsTableLinkedCompanySql,
  newsTablePageWindow,
  newsTableSliceSql,
} from "./table-page-sql";

export type NewsTablePage = {
  stories: NewsListItem[];
  rumors: NewsRumorItem[];
  order: Array<{ kind: "story" | "rumor"; id: string }>;
  total: number;
  page: number;
  totalPages: number;
  sources: Array<{ key: string; label: string }>;
  writers: string[];
  companies: Array<{ id: string; name: string }>;
};

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }
  return [];
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

function mapSlice(
  rows: readonly Record<string, unknown>[],
): Pick<NewsTablePage, "stories" | "rumors" | "order"> {
  const stories: NewsListItem[] = [];
  const rumors: NewsRumorItem[] = [];
  const order: NewsTablePage["order"] = [];
  for (const row of rows) {
    const kind =
      row.kind === "rumor" ? "rumor" : row.kind === "story" ? "story" : null;
    const id = asText(row.id);
    if (!kind || !id) continue;
    order.push({ kind, id });
    if (kind === "story") {
      stories.push({
        id,
        url: asText(row.url),
        title: asText(row.title),
        author: row.author == null ? null : asText(row.author),
        publishedAt: asDate(row.published_at),
        summary: asText(row.summary),
        aiSummary: row.ai_summary == null ? null : asText(row.ai_summary),
      });
      continue;
    }
    rumors.push({
      id,
      title: asText(row.title),
      url: row.url == null || asText(row.url) === "" ? null : asText(row.url),
      body: asText(row.body),
      submitterName: asText(row.author),
      createdAt: asDate(row.published_at) ?? new Date(0),
      hiddenAt: asDate(row.hidden_at),
    });
  }
  return { stories, rumors, order };
}

function mapFacets(
  rows: readonly Record<string, unknown>[],
  memberSource: string,
): Pick<NewsTablePage, "sources" | "writers"> {
  const sources = new Map<string, string>();
  const writers = new Set<string>();
  let sawRumor = false;
  const addSource = (host: string) => {
    const source = newsSourceFromUrl(host ? `https://${host}/` : "");
    if (source.key && source.label) sources.set(source.key, source.label);
    return source.label;
  };
  for (const row of rows) {
    const bucket = asText(row.bucket);
    const value = asText(row.value).trim();
    if (bucket === "rumor") {
      sawRumor = true;
      continue;
    }
    if (bucket === "rumor-author") {
      sawRumor = true;
      const writer = newsTableWriter(value);
      if (writer) writers.add(writer);
      continue;
    }
    if (bucket === "author") {
      const writer = newsTableWriter(value);
      if (writer) writers.add(writer);
      continue;
    }
    if (bucket === "host") {
      addSource(value);
      continue;
    }
    if (bucket === "blank-host") {
      const label = addSource(value);
      const writer = newsTableWriter(label);
      if (writer) writers.add(writer);
    }
  }
  if (sawRumor && memberSource) sources.set(NEWS_MEMBER_SOURCE, memberSource);
  return {
    sources: [...sources.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => collator.compare(a.label, b.label)),
    writers: [...writers].sort((a, b) => collator.compare(a, b)),
  };
}

function mapCompanies(
  rows: readonly Record<string, unknown>[],
): NewsTablePage["companies"] {
  const companies = new Map<string, string>();
  for (const row of rows) {
    const slug = asText(row.slug).trim();
    const name = asText(row.name).trim();
    if (!slug || !name) continue;
    companies.set(`dir:${slug}`, name);
  }
  return [...companies.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

type NewsTablePageInput = {
  query: NewsTableQuery;
  includeHiddenRumors: boolean;
  memberSource: string;
  pageSize?: number;
};

/**
 * One counted page of stories and rumors. The count is every matching row,
 * and the page is `LIMIT`/`OFFSET` after that count clamps the page number.
 */
async function queryNewsTablePageUncached(
  input: NewsTablePageInput,
): Promise<NewsTablePage> {
  const counted = await db.execute<{ total: number }>(
    newsTableCountSql({
      query: input.query,
      includeHiddenRumors: input.includeHiddenRumors,
      memberSource: input.memberSource,
    }),
  );
  const total = asCount(asRows(counted)[0]?.total);
  const window = newsTablePageWindow(total, input.query.page, input.pageSize);
  const [slice, facets, companies] = await Promise.all([
    db.execute(
      newsTableSliceSql({
        query: input.query,
        includeHiddenRumors: input.includeHiddenRumors,
        memberSource: input.memberSource,
        limit: window.limit,
        offset: window.offset,
      }),
    ),
    db.execute(newsTableFacetSql(input.includeHiddenRumors)),
    db.execute(newsTableLinkedCompanySql()),
  ]);
  const page = mapSlice(asRows(slice));
  const menu = mapFacets(asRows(facets), input.memberSource);
  return {
    ...page,
    total,
    page: window.page,
    totalPages: window.totalPages,
    sources: menu.sources,
    writers: menu.writers,
    companies: mapCompanies(asRows(companies)),
  };
}

function freezeNewsTablePage(page: NewsTablePage) {
  return {
    ...page,
    stories: page.stories.map((story) => ({
      ...story,
      publishedAt: story.publishedAt ? story.publishedAt.toISOString() : null,
    })),
    rumors: page.rumors.map((rumor) => ({
      ...rumor,
      createdAt: rumor.createdAt.toISOString(),
      hiddenAt: rumor.hiddenAt ? rumor.hiddenAt.toISOString() : null,
    })),
  };
}

function thawNewsTablePage(
  page: ReturnType<typeof freezeNewsTablePage>,
): NewsTablePage {
  return {
    ...page,
    stories: page.stories.map((story) => ({
      ...story,
      publishedAt: asDate(story.publishedAt),
    })),
    rumors: page.rumors.map((rumor) => ({
      ...rumor,
      createdAt: asDate(rumor.createdAt) ?? new Date(0),
      hiddenAt: asDate(rumor.hiddenAt),
    })),
  };
}

const loadCachedNewsTablePage = unstable_cache(
  async (payload: string) =>
    freezeNewsTablePage(
      await queryNewsTablePageUncached(
        JSON.parse(payload) as NewsTablePageInput,
      ),
    ),
  ["news-table-page"],
  { revalidate: 60, tags: [NEWS_TABLE_CACHE_TAG] },
);

export async function queryNewsTablePage(
  input: NewsTablePageInput,
): Promise<NewsTablePage> {
  const payload = JSON.stringify({
    query: input.query,
    includeHiddenRumors: input.includeHiddenRumors,
    memberSource: input.memberSource,
    pageSize: input.pageSize ?? null,
  });
  try {
    return thawNewsTablePage(await loadCachedNewsTablePage(payload));
  } catch (err) {
    console.error("news: table cache unavailable, querying directly", err);
    return queryNewsTablePageUncached(input);
  }
}
