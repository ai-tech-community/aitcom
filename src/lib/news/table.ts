import {
  detectNewsCompanies,
  indexNewsDirectory,
  newsHostname,
  newsSourceLogoUrl,
  type NewsDirectoryCompany,
  type NewsMatchCompany,
} from "@/lib/news/companies";
import {
  applyNewsStartupLinks,
  type NewsStartupLink,
} from "@/lib/news/startup-match";
import { plainText } from "@/server/collectors/helpers/feed";
import { NEWS_FEEDS } from "@/server/news/feeds";
import { clampNewsSummary } from "@/server/news/summary";
import {
  NEWS_MEMBER_SOURCE,
  NEWS_PAGE_SIZE,
  newsTableWriter,
  type NewsTableQuery,
  type NewsTableSort,
} from "@/lib/news/table-query";

export {
  NEWS_MEMBER_SOURCE,
  NEWS_PAGE_SIZE,
  newsTableHref,
  newsTableSearchRegex,
  newsTableWriter,
  parseNewsTableQuery,
} from "@/lib/news/table-query";
export type {
  NewsTableQuery,
  NewsTableSort,
  NewsTableType,
} from "@/lib/news/table-query";

export type NewsStoryInput = {
  id: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  /** Feed description or excerpt. */
  summary: string;
  /** Stored TL;DR from ingest. Absent or blank falls back to `summary`. */
  aiSummary?: string | null;
  /** True, false, or null when the story is still untagged. */
  isAi?: boolean | null;
};

export type NewsRumorInput = {
  id: string;
  title: string;
  url: string | null;
  body: string;
  submitterName: string;
  createdAt: Date;
  hiddenAt: Date | null;
};

export type NewsTableRow = {
  kind: "story" | "rumor";
  id: string;
  title: string;
  href: string | null;
  /** Short line under the title. Empty when there is nothing real to show. */
  blurb: string;
  /** Feed excerpt or member note, kept in full so search is not limited to the line. */
  text: string;
  writer: string;
  sourceKey: string;
  sourceLabel: string;
  at: number | null;
  companies: NewsMatchCompany[];
  fallbackLogo: string | null;
  hidden: boolean;
  /** Set on a collected story. Rumors stay untagged. */
  isAi?: boolean | null;
};

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

/**
 * Feed hosts such as `feeds.bloomberg.com` and `rss.nytimes.com` publish
 * stories on the parent site. BBC articles use bbc.co.uk / bbc.com while
 * the feed host is bbci.co.uk.
 */
export function newsComparableHost(host: string): string {
  const stripped = host.replace(/^(?:feeds|rss)\./, "");
  if (
    stripped === "bbci.co.uk" ||
    stripped === "bbc.co.uk" ||
    stripped === "bbc.com"
  ) {
    return "bbc.co.uk";
  }
  return stripped;
}

function mergeOutletName(current: string, next: string): string {
  const general = [current, next].filter((name) => !name.includes(" — "));
  if (general.length > 0) {
    return general.reduce((shortest, name) =>
      name.length < shortest.length ? name : shortest,
    );
  }
  const left = current.split(" — ")[0]?.trim() ?? current;
  const right = next.split(" — ")[0]?.trim() ?? next;
  return left === right ? left : current;
}

/**
 * One label per publication. A section feed and a general feed on the same
 * host share that label, so a gadgets story is not shown as the AI section.
 * The feed URL itself still uses the feed's own name via `newsSourceFromUrl`.
 */
export function newsOutletLabels(): Array<{ host: string; name: string }> {
  const rows: Array<{ host: string; name: string }> = [];
  const index = new Map<string, number>();
  for (const feed of NEWS_FEEDS) {
    const raw = newsHostname(feed.url);
    if (!raw) continue;
    const host = newsComparableHost(raw);
    const at = index.get(host);
    if (at === undefined) {
      index.set(host, rows.length);
      rows.push({ host, name: feed.name });
      continue;
    }
    const current = rows[at];
    if (!current) continue;
    current.name = mergeOutletName(current.name, feed.name);
  }
  return rows;
}

export function newsSourceFromUrl(url: string): { key: string; label: string } {
  const host = newsHostname(url);
  if (!host) return { key: "host:unknown", label: "" };
  const exact = NEWS_FEEDS.find((feed) => feed.url === url);
  if (exact) {
    const feedHost = newsHostname(exact.url);
    if (feedHost) return { key: `feed:${feedHost}`, label: exact.name };
  }
  const comparable = newsComparableHost(host);
  for (const outlet of newsOutletLabels()) {
    if (
      host === outlet.host ||
      host.endsWith(`.${outlet.host}`) ||
      comparable === outlet.host
    ) {
      return { key: `feed:${outlet.host}`, label: outlet.name };
    }
  }
  return { key: `host:${host}`, label: host };
}

/**
 * The line under a title. A stored TL;DR wins. Otherwise the feed excerpt
 * or the member's note, with tags removed and the length held to the same
 * cap as a stored TL;DR. The title is never copied in to fill a blank.
 */
export function newsTableBlurb(input: {
  aiSummary?: string | null;
  excerpt?: string | null;
}): string {
  const written = input.aiSummary?.replace(/\s+/g, " ").trim() ?? "";
  if (written) return clampNewsSummary(written);
  const excerpt = plainText(input.excerpt ?? "");
  if (!excerpt) return "";
  return clampNewsSummary(excerpt);
}

export function buildNewsTableRows(
  stories: readonly NewsStoryInput[],
  rumors: readonly NewsRumorInput[],
  directory: readonly NewsDirectoryCompany[],
  labels: { memberSource: string },
  links: {
    stories?: Readonly<Record<string, readonly NewsStartupLink[]>>;
    rumors?: Readonly<Record<string, readonly NewsStartupLink[]>>;
  } = {},
): NewsTableRow[] {
  const indexed = indexNewsDirectory(directory);
  const storyRows: NewsTableRow[] = stories.map((story) => {
    const companies = detectNewsCompanies(
      {
        title: story.title,
        text: `${story.summary}\n${story.aiSummary ?? ""}`,
        url: story.url,
      },
      directory,
      indexed,
    );
    const source = newsSourceFromUrl(story.url);
    const author = story.author?.trim() ?? "";
    return {
      kind: "story",
      id: story.id,
      title: story.title,
      href: story.url,
      blurb: newsTableBlurb({
        aiSummary: story.aiSummary,
        excerpt: story.summary,
      }),
      text: story.summary,
      writer: author || source.label,
      sourceKey: source.key,
      sourceLabel: source.label,
      at: story.publishedAt ? story.publishedAt.getTime() : null,
      companies,
      fallbackLogo: companies.length > 0 ? null : newsSourceLogoUrl(story.url),
      hidden: false,
      isAi: story.isAi === true ? true : story.isAi === false ? false : null,
    };
  });
  for (const row of storyRows) {
    row.companies = applyNewsStartupLinks(
      row.companies,
      links.stories?.[row.id] ?? [],
    );
    if (row.companies.length > 0) row.fallbackLogo = null;
  }
  const rumorRows: NewsTableRow[] = rumors.map((rumor) => {
    const companies = detectNewsCompanies(
      { title: rumor.title, text: rumor.body, url: rumor.url },
      directory,
      indexed,
    );
    return {
      kind: "rumor",
      id: rumor.id,
      title: rumor.title,
      href: rumor.url,
      blurb: newsTableBlurb({ excerpt: rumor.body }),
      text: rumor.body,
      writer: rumor.submitterName,
      sourceKey: NEWS_MEMBER_SOURCE,
      sourceLabel: labels.memberSource,
      at: rumor.createdAt.getTime(),
      companies,
      fallbackLogo: companies.length > 0 ? null : newsSourceLogoUrl(rumor.url),
      hidden: rumor.hiddenAt != null,
    };
  });
  for (const row of rumorRows) {
    row.companies = applyNewsStartupLinks(
      row.companies,
      links.rumors?.[row.id] ?? [],
    );
    if (row.companies.length > 0) row.fallbackLogo = null;
  }
  return [...storyRows, ...rumorRows];
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesSearch(row: NewsTableRow, q: string): boolean {
  if (!q) return true;
  const needle = normalizeSearch(q);
  return (
    normalizeSearch(row.title).includes(needle) ||
    normalizeSearch(row.blurb).includes(needle) ||
    normalizeSearch(row.text).includes(needle)
  );
}

function compareTitle(a: NewsTableRow, b: NewsTableRow): number {
  return collator.compare(a.title, b.title) || a.id.localeCompare(b.id);
}

function compareRows(
  sort: NewsTableSort,
  a: NewsTableRow,
  b: NewsTableRow,
): number {
  if (sort === "title") return compareTitle(a, b);
  if (sort === "source") {
    return collator.compare(a.sourceLabel, b.sourceLabel) || compareTitle(a, b);
  }
  if (a.at == null && b.at == null) return compareTitle(a, b);
  if (a.at == null) return 1;
  if (b.at == null) return -1;
  return b.at - a.at || compareTitle(a, b);
}

export function applyNewsTableQuery(
  rows: readonly NewsTableRow[],
  query: NewsTableQuery,
  pageSize: number = NEWS_PAGE_SIZE,
): {
  items: NewsTableRow[];
  page: number;
  totalPages: number;
  total: number;
} {
  const filtered = rows.filter((row) => {
    if (query.type === "verified" && row.kind !== "story") return false;
    if (query.type === "rumor" && row.kind !== "rumor") return false;
    if (query.source && row.sourceKey !== query.source) return false;
    if (
      query.company &&
      !row.companies.some((company) => company.id === query.company)
    ) {
      return false;
    }
    if (query.writer && newsTableWriter(row.writer) !== query.writer) {
      return false;
    }
    return matchesSearch(row, query.q);
  });
  const sorted = [...filtered].sort((a, b) => compareRows(query.sort, a, b));
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * pageSize;
  let items = sorted.slice(start, start + pageSize);
  if (query.story) {
    const pinned = rows.find(
      (row) => row.kind === "story" && row.id === query.story,
    );
    if (
      pinned &&
      !items.some((item) => item.kind === "story" && item.id === pinned.id)
    ) {
      items = [...items, pinned];
    }
  }
  return { items, page, totalPages, total };
}

export function newsTableFacets(rows: readonly NewsTableRow[]): {
  sources: Array<{ key: string; label: string }>;
  companies: Array<{ id: string; name: string }>;
  writers: string[];
} {
  const sources = new Map<string, string>();
  const companies = new Map<string, string>();
  const writers = new Set<string>();
  for (const row of rows) {
    if (row.sourceKey && row.sourceLabel)
      sources.set(row.sourceKey, row.sourceLabel);
    for (const company of row.companies)
      companies.set(company.id, company.name);
    const writer = newsTableWriter(row.writer);
    if (writer) writers.add(writer);
  }
  return {
    sources: [...sources.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => collator.compare(a.label, b.label)),
    companies: [...companies.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => collator.compare(a.name, b.name)),
    writers: [...writers].sort((a, b) => collator.compare(a, b)),
  };
}
