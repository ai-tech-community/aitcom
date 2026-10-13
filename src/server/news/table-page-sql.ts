import { sql, type SQL } from "drizzle-orm";

import { findCuratedNewsCompany, newsHostname } from "@/lib/news/companies";
import {
  NEWS_PAGE_SIZE,
  newsTableSearchRegex,
  newsTableWriter,
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

/** Date and title pages with no text, source, company, or writer filter. */
export function newsTableFastPath(query: NewsTableQuery): boolean {
  return (
    query.q === "" &&
    query.source === "" &&
    query.company === "" &&
    query.writer === "" &&
    query.sort !== "source"
  );
}

function authorNormSql(): SQL {
  return sql`left(regexp_replace(btrim(coalesce("author", '')), '\\s+', ' ', 'g'), 160)`;
}

function submitterNormSql(): SQL {
  return sql`left(regexp_replace(btrim("submitter_name"), '\\s+', ' ', 'g'), 160)`;
}

function andSql(parts: Array<SQL | null>): SQL {
  const present = parts.filter((part): part is SQL => part != null);
  if (present.length === 0) return sql`true`;
  return sql.join(present, sql` AND `);
}

function storySearchArms(query: NewsTableQuery): Array<SQL | null> {
  if (!query.q) return [null];
  const regex = newsTableSearchRegex(query.q);
  return [
    sql`lower("title") ~ ${regex}`,
    sql`lower("summary") ~ ${regex}`,
    sql`lower(coalesce("ai_summary", '')) ~ ${regex}`,
  ];
}

function rumorSearchArms(query: NewsTableQuery): Array<SQL | null> {
  if (!query.q) return [null];
  const regex = newsTableSearchRegex(query.q);
  return [sql`lower("title") ~ ${regex}`, sql`lower("body") ~ ${regex}`];
}

/**
 * A blank byline displays the source label. Skip that scan unless the
 * writer filter can actually equal one (a feed name, or a raw host).
 */
function blankAuthorWriterPossible(writer: string): boolean {
  for (const feed of feedHosts()) {
    if (newsTableWriter(feed.name) === writer) return true;
  }
  return writer.includes(".") && !/\s/.test(writer);
}

function storyWheres(query: NewsTableQuery): SQL[] {
  if (query.type === "rumor") return [];
  const writers: Array<SQL | null> = query.writer
    ? [
        sql`${authorNormSql()} = ${query.writer}`,
        ...(blankAuthorWriterPossible(query.writer)
          ? [sql`btrim(coalesce("author", '')) = ''`]
          : []),
      ]
    : [null];
  const wheres: SQL[] = [];
  for (const writer of writers) {
    for (const search of storySearchArms(query)) {
      wheres.push(andSql([writer, search]));
    }
  }
  return wheres;
}

function rumorWheres(
  query: NewsTableQuery,
  includeHiddenRumors: boolean,
): SQL[] {
  if (query.type === "verified") return [];
  const hidden = includeHiddenRumors ? null : sql`"hidden_at" IS NULL`;
  const writer = query.writer
    ? sql`${submitterNormSql()} = ${query.writer}`
    : null;
  return rumorSearchArms(query).map((search) =>
    andSql([hidden, writer, search]),
  );
}

function storyBranch(where: SQL): SQL {
  return sql`
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
    WHERE ${where}
  `;
}

function rumorBranch(where: SQL): SQL {
  return sql`
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
    WHERE ${where}
  `;
}

function filteredSql(input: {
  query: NewsTableQuery;
  includeHiddenRumors: boolean;
  memberSource: string;
}): SQL {
  const branches = [
    ...storyWheres(input.query).map((where) => storyBranch(where)),
    ...rumorWheres(input.query, input.includeHiddenRumors).map((where) =>
      rumorBranch(where),
    ),
  ];
  const union =
    branches.length > 0
      ? sql.join(branches, sql` UNION `)
      : sql`
          SELECT
            'story'::text AS kind,
            ''::varchar AS id,
            ''::text AS url,
            ''::text AS title,
            ''::text AS author,
            NULL::timestamp with time zone AS published_at,
            ''::text AS summary,
            NULL::text AS ai_summary,
            ''::text AS body,
            NULL::timestamp with time zone AS hidden_at,
            ''::text AS host
          WHERE false
        `;
  return sql`
    WITH raw AS MATERIALIZED (
      ${union}
    ),
    labeled AS (
      SELECT
        raw.*,
        ${sourceKeySql()} AS source_key,
        ${sourceLabelSql(input.memberSource)} AS source_label
      FROM raw
    ),
    visible AS (
      SELECT
        labeled.*,
        ${writerSql()} AS writer
      FROM labeled
    )
  `;
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

function outerFilters(query: NewsTableQuery): SQL {
  const parts: SQL[] = [];
  if (query.source) parts.push(sql`source_key = ${query.source}`);
  if (query.writer) parts.push(sql`writer = ${query.writer}`);
  if (query.company) parts.push(companySql(query.company));
  if (parts.length === 0) return sql`true`;
  return sql.join(parts, sql` AND `);
}

function fastCountSql(
  query: NewsTableQuery,
  includeHiddenRumors: boolean,
): SQL {
  const parts: SQL[] = [];
  if (query.type !== "rumor") {
    parts.push(sql`(SELECT count(*) FROM "app"."news_item")`);
  }
  if (query.type !== "verified") {
    parts.push(
      sql`(SELECT count(*) FROM "app"."news_rumor" WHERE "hidden_at" IS NULL OR ${includeHiddenRumors})`,
    );
  }
  return sql`SELECT (${sql.join(parts, sql` + `)})::int AS total`;
}

function fastSliceSql(input: {
  query: NewsTableQuery;
  includeHiddenRumors: boolean;
  limit: number;
  offset: number;
}): SQL {
  const branches: SQL[] = [];
  if (input.query.type !== "rumor") {
    branches.push(sql`
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
        NULL::timestamp with time zone AS hidden_at
      FROM "app"."news_item"
    `);
  }
  if (input.query.type !== "verified") {
    branches.push(sql`
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
        "hidden_at"
      FROM "app"."news_rumor"
      WHERE "hidden_at" IS NULL OR ${input.includeHiddenRumors}
    `);
  }
  return sql`
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
    FROM (${sql.join(branches, sql` UNION ALL `)}) visible
    ORDER BY ${orderSql(input.query.sort)}
    LIMIT ${input.limit} OFFSET ${input.offset}
  `;
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
  if (newsTableFastPath(input.query)) {
    return fastCountSql(input.query, input.includeHiddenRumors);
  }
  return sql`
    ${filteredSql(input)}
    SELECT count(*)::int AS total
    FROM visible
    WHERE ${outerFilters(input.query)}
  `;
}

export function newsTableSliceSql(input: {
  query: NewsTableQuery;
  includeHiddenRumors: boolean;
  memberSource: string;
  limit: number;
  offset: number;
}): SQL {
  if (newsTableFastPath(input.query)) {
    return fastSliceSql(input);
  }
  return sql`
    ${filteredSql(input)}
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
    WHERE ${outerFilters(input.query)}
    ORDER BY ${orderSql(input.query.sort)}
    LIMIT ${input.limit} OFFSET ${input.offset}
  `;
}

/**
 * Distinct bylines and hosts, not one row per story. The page turns hosts
 * into source labels in memory.
 */
export function newsTableFacetSql(includeHiddenRumors: boolean): SQL {
  const host = sql`lower(regexp_replace(split_part(coalesce(substring("url" from '^https?://([^/?#]+)'), ''), ':', 1), '^www\\.', ''))`;
  return sql`
    SELECT 'author'::text AS bucket, btrim("author") AS value
    FROM "app"."news_item"
    WHERE "author" IS NOT NULL AND btrim("author") <> ''
    UNION
    SELECT 'blank-host'::text, ${host}
    FROM "app"."news_item"
    WHERE btrim(coalesce("author", '')) = ''
    UNION
    SELECT 'host'::text, ${host}
    FROM "app"."news_item"
    UNION
    SELECT 'rumor-author'::text, btrim("submitter_name")
    FROM "app"."news_rumor"
    WHERE ("hidden_at" IS NULL OR ${includeHiddenRumors})
      AND btrim("submitter_name") <> ''
    UNION
    SELECT 'rumor'::text, '1'
    WHERE EXISTS (
      SELECT 1 FROM "app"."news_rumor"
      WHERE "hidden_at" IS NULL OR ${includeHiddenRumors}
    )
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
