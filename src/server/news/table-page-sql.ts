import { sql, type SQL } from "drizzle-orm";

import { findCuratedNewsCompany, newsHostname } from "@/lib/news/companies";
import {
  NEWS_PAGE_SIZE,
  type NewsTableQuery,
  type NewsTableSort,
} from "@/lib/news/table";
import { NEWS_FEEDS } from "@/server/news/feeds";

export type NewsTablePageWindow = {
  page: number;
  totalPages: number;
  limit: number;
  offset: number;
};

/** Page index clamped to the real row count. Offset is zero on an empty table. */
export function newsTablePageWindow(
  total: number,
  page: number,
  pageSize: number = NEWS_PAGE_SIZE,
): NewsTablePageWindow {
  const size = pageSize > 0 ? Math.floor(pageSize) : NEWS_PAGE_SIZE;
  const rows = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = Math.max(1, Math.ceil(rows / size) || 1);
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return {
    page: clamped,
    totalPages,
    limit: size,
    offset: (clamped - 1) * size,
  };
}

function hostSql(): SQL {
  return sql`lower(regexp_replace(split_part(coalesce(substring(url from '^https?://([^/?#]+)'), ''), ':', 1), '^www\\.', ''))`;
}

function feedHosts(): Array<{ host: string; name: string }> {
  const seen: Array<{ host: string; name: string }> = [];
  for (const feed of NEWS_FEEDS) {
    const host = newsHostname(feed.url);
    if (!host) continue;
    seen.push({ host, name: feed.name });
  }
  return seen;
}

/** First matching feed host wins, same order as `newsSourceFromUrl`. */
function sourceKeySql(): SQL {
  const arms = feedHosts().map(
    (feed) =>
      sql`WHEN host = ${feed.host} OR host LIKE ${`%.${feed.host}`} THEN ${`feed:${feed.host}`}`,
  );
  arms.push(
    sql`WHEN host <> '' AND position('.' in host) > 0 THEN 'host:' || host`,
  );
  return sql`CASE ${sql.join(arms, sql` `)} ELSE 'host:unknown' END`;
}

function sourceLabelSql(memberSource: string): SQL {
  const arms: SQL[] = [sql`WHEN kind = 'rumor' THEN ${memberSource}`];
  for (const feed of feedHosts()) {
    arms.push(
      sql`WHEN host = ${feed.host} OR host LIKE ${`%.${feed.host}`} THEN ${feed.name}`,
    );
  }
  arms.push(sql`WHEN host <> '' AND position('.' in host) > 0 THEN host`);
  return sql`CASE ${sql.join(arms, sql` `)} ELSE '' END`;
}

function writerSql(): SQL {
  return sql`left(regexp_replace(btrim(CASE WHEN kind = 'rumor' THEN coalesce(author, '') WHEN btrim(coalesce(author, '')) <> '' THEN author ELSE source_label END), '\\s+', ' ', 'g'), 160)`;
}

function visibleSql(includeHiddenRumors: boolean, memberSource: string): SQL {
  return sql`
    WITH base AS (
      SELECT
        'story'::text AS kind,
        "id",
        "url",
        "title",
        "author",
        "published_at",
        "summary",
        "ai_summary",
        ''::text AS body,
        NULL::timestamp with time zone AS hidden_at,
        ${hostSql()} AS host
      FROM "app"."news_item"
      UNION ALL
      SELECT
        'rumor'::text,
        "id",
        "url",
        "title",
        "submitter_name",
        "created_at",
        ''::text,
        NULL::text,
        "body",
        "hidden_at",
        ${hostSql()} AS host
      FROM "app"."news_rumor"
    ),
    labeled AS (
      SELECT
        base.*,
        ${sourceKeySql()} AS source_key,
        ${sourceLabelSql(memberSource)} AS source_label
      FROM base
    ),
    visible AS (
      SELECT
        labeled.*,
        ${writerSql()} AS writer
      FROM labeled
      WHERE kind = 'story' OR hidden_at IS NULL OR ${includeHiddenRumors}
    )
  `;
}

function likePattern(q: string): string {
  const needle = q.toLowerCase().replace(/\s+/g, " ").trim();
  return `%${needle.replace(/[\\%_]/g, "\\$&")}%`;
}

function mentionPattern(phrase: string): string {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(?:^|[^[:alnum:]])${escaped}(?:$|[^[:alnum:]])`;
}

function companySql(companyId: string): SQL {
  if (companyId.startsWith("dir:")) {
    const slug = companyId.slice(4);
    if (!slug) return sql`false`;
    return sql`(
      (kind = 'story' AND EXISTS (
        SELECT 1 FROM "app"."news_item_startup" nis
        JOIN "app"."startup" s ON s."id" = nis."startup_id"
        WHERE nis."news_item_id" = visible.id AND s."slug" = ${slug}
      ))
      OR (kind = 'rumor' AND EXISTS (
        SELECT 1 FROM "app"."news_rumor_startup" nrs
        JOIN "app"."startup" s ON s."id" = nrs."startup_id"
        WHERE nrs."news_rumor_id" = visible.id AND s."slug" = ${slug}
      ))
    )`;
  }
  const curated = findCuratedNewsCompany(companyId);
  if (!curated) return sql`false`;
  const parts: SQL[] = [];
  for (const alias of curated.aliases) {
    if (alias.trim().length < 2) continue;
    parts.push(
      sql`(chr(10) || title || chr(10) || coalesce(summary, '') || chr(10) || coalesce(ai_summary, '') || chr(10) || coalesce(body, '') || chr(10)) ~* ${mentionPattern(alias)}`,
    );
  }
  for (const domain of curated.domains) {
    const host = domain.toLowerCase().replace(/^www\./, "");
    if (!host) continue;
    parts.push(
      sql`(host <> '' AND (host = ${host} OR host LIKE ${`%.${host}`} OR ${host} LIKE '%.' || host))`,
    );
  }
  if (parts.length === 0) return sql`false`;
  return sql`(${sql.join(parts, sql` OR `)})`;
}

export function newsTableFilters(query: NewsTableQuery): SQL {
  const parts: SQL[] = [];
  if (query.type === "verified") parts.push(sql`kind = 'story'`);
  if (query.type === "rumor") parts.push(sql`kind = 'rumor'`);
  if (query.source) parts.push(sql`source_key = ${query.source}`);
  if (query.writer) parts.push(sql`writer = ${query.writer}`);
  if (query.q) {
    const pattern = likePattern(query.q);
    parts.push(sql`(
      regexp_replace(lower(title), '\\s+', ' ', 'g') LIKE ${pattern}
      OR regexp_replace(lower(coalesce(summary, '')), '\\s+', ' ', 'g') LIKE ${pattern}
      OR regexp_replace(lower(coalesce(ai_summary, '')), '\\s+', ' ', 'g') LIKE ${pattern}
      OR regexp_replace(lower(coalesce(body, '')), '\\s+', ' ', 'g') LIKE ${pattern}
    )`);
  }
  if (query.company) parts.push(companySql(query.company));
  if (parts.length === 0) return sql`true`;
  return sql.join(parts, sql` AND `);
}

function orderSql(sort: NewsTableSort): SQL {
  if (sort === "title") return sql`title ASC, id ASC`;
  if (sort === "source") return sql`source_label ASC, title ASC, id ASC`;
  return sql`published_at DESC NULLS LAST, title ASC, id ASC`;
}

export function newsTableCountSql(input: {
  query: NewsTableQuery;
  includeHiddenRumors: boolean;
  memberSource: string;
}): SQL {
  return sql`
    ${visibleSql(input.includeHiddenRumors, input.memberSource)}
    SELECT count(*)::int AS total
    FROM visible
    WHERE ${newsTableFilters(input.query)}
  `;
}

export function newsTableSliceSql(input: {
  query: NewsTableQuery;
  includeHiddenRumors: boolean;
  memberSource: string;
  limit: number;
  offset: number;
}): SQL {
  return sql`
    ${visibleSql(input.includeHiddenRumors, input.memberSource)}
    SELECT
      kind,
      id,
      url,
      title,
      author,
      published_at,
      summary,
      ai_summary,
      body,
      hidden_at
    FROM visible
    WHERE ${newsTableFilters(input.query)}
    ORDER BY ${orderSql(input.query.sort)}
    LIMIT ${input.limit} OFFSET ${input.offset}
  `;
}

/** URL and byline only, so source and writer menus cover every visible row. */
export function newsTableFacetSql(includeHiddenRumors: boolean): SQL {
  return sql`
    SELECT kind, url, author
    FROM (
      SELECT 'story'::text AS kind, "url", "author", NULL::timestamp with time zone AS hidden_at
      FROM "app"."news_item"
      UNION ALL
      SELECT 'rumor'::text, "url", "submitter_name", "hidden_at"
      FROM "app"."news_rumor"
    ) rows
    WHERE kind = 'story' OR hidden_at IS NULL OR ${includeHiddenRumors}
  `;
}

export function newsTableLinkedCompanySql(): SQL {
  return sql`
    SELECT s."slug" AS slug, s."name" AS name
    FROM "app"."startup" s
    WHERE EXISTS (
      SELECT 1 FROM "app"."news_item_startup" nis
      WHERE nis."startup_id" = s."id"
    ) OR EXISTS (
      SELECT 1 FROM "app"."news_rumor_startup" nrs
      WHERE nrs."startup_id" = s."id"
    )
  `;
}
