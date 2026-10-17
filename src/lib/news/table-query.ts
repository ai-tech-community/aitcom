import { parseNewsSector, type NewsSector } from "@/lib/news/sectors";

/**
 * URL state for /news. This module stays free of server imports so the
 * filter bar can build the same hrefs without pulling the table renderer
 * into the client bundle.
 */

export const NEWS_PAGE_SIZE = 20;

export const NEWS_MEMBER_SOURCE = "member";

export type NewsTableType = "all" | "verified" | "rumor";
export type NewsTableSort = "date" | "title" | "source";

export type NewsTableQuery = {
  q: string;
  type: NewsTableType;
  source: string;
  company: string;
  writer: string;
  sort: NewsTableSort;
  page: number;
  story: string;
  /** Empty string is the unfiltered news page. */
  sector: NewsSector | "";
};

/** Exact writer filter value: the name shown in the Writer cell, trimmed and capped. */
export function newsTableWriter(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseNewsTableQuery(raw: {
  q?: string | string[];
  type?: string | string[];
  source?: string | string[];
  company?: string | string[];
  writer?: string | string[];
  sort?: string | string[];
  page?: string | string[] | number;
  story?: string | string[];
  sector?: string | string[];
}): NewsTableQuery {
  const q = (first(raw.q) ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  const typeRaw = (first(raw.type) ?? "").trim().toLowerCase();
  const type: NewsTableType =
    typeRaw === "verified" || typeRaw === "rumor" ? typeRaw : "all";
  const sortRaw = (first(raw.sort) ?? "").trim().toLowerCase();
  const sort: NewsTableSort =
    sortRaw === "title" || sortRaw === "source" ? sortRaw : "date";
  const pageRaw = raw.page;
  const page =
    typeof pageRaw === "number"
      ? Number.isFinite(pageRaw) && pageRaw >= 1
        ? Math.floor(pageRaw)
        : 1
      : Math.max(1, Number.parseInt(first(pageRaw) ?? "1", 10) || 1);
  return {
    q,
    type,
    source: (first(raw.source) ?? "").trim().slice(0, 160),
    company: (first(raw.company) ?? "").trim().slice(0, 80),
    writer: newsTableWriter(first(raw.writer) ?? ""),
    sort,
    page,
    story: (first(raw.story) ?? "").trim().slice(0, 255),
    sector: parseNewsSector(first(raw.sector)) ?? "",
  };
}

export function newsTableHref(
  query: NewsTableQuery,
  patch: Partial<NewsTableQuery> = {},
): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.type !== "all") params.set("type", next.type);
  if (next.source) params.set("source", next.source);
  if (next.company) params.set("company", next.company);
  if (next.writer) params.set("writer", next.writer);
  if (next.sort !== "date") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.story) params.set("story", next.story);
  if (next.sector) params.set("sector", next.sector);
  const qs = params.toString();
  return qs ? `/news?${qs}` : "/news";
}

/**
 * POSIX regex equivalent of collapsing whitespace and then doing a
 * case-insensitive substring search. `openai   models` and a newline
 * between the words still match the query "OpenAI models". Metacharacters
 * in the query stay literal.
 */
export function newsTableSearchRegex(q: string): string {
  const needle = q.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return "";
  return needle
    .split(" ")
    .map((part) => part.replace(/[\\.^$*+?()[\]{}|]/g, "\\$&"))
    .join("\\s+");
}
