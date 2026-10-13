import {
  and,
  eq,
  inArray,
  notInArray,
  or,
  sql,
  ilike,
  count,
} from "drizzle-orm";
import { newsTableSearchRegex } from "@/lib/news/table-query";
import { db } from "@/server/db";
import {
  newsItems,
  newsStorylines as stories,
  newsStorylineArticles as memberships,
  newsStorylineConnections as connections,
} from "@/server/db/schema";
import {
  publicationIssues,
  validStorylineEvidence,
  type StorylineInput,
  type StorylineMembership,
} from "@/lib/news/storylines";
import { revalidateNewsTable } from "./cache";

export class StorylineError extends Error {
  constructor(
    public readonly code: "missing" | "conflict" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

// Same source evidence rule as the shared validator, applied before pagination.
const validMembership = sql`length(btrim(${memberships.noteEn})) > 0
  and length(btrim(regexp_replace(${memberships.evidence}, '\\s+', ' ', 'g'))) >= 12
  and (position(lower(btrim(regexp_replace(${memberships.evidence}, '\\s+', ' ', 'g')))
    in lower(btrim(regexp_replace(${newsItems.title}, '\\s+', ' ', 'g')))) > 0
  or position(lower(btrim(regexp_replace(${memberships.evidence}, '\\s+', ' ', 'g')))
    in lower(btrim(regexp_replace(${newsItems.summary}, '\\s+', ' ', 'g')))) > 0)`;
const articleCount = sql<number>`(select count(*)::int from ${memberships}
  join ${newsItems} on ${newsItems.id} = ${memberships.articleId}
  where ${memberships.storylineId} = ${stories.id} and ${validMembership})`;
const latestAt = sql<Date | null>`(select max(${newsItems.publishedAt}) from ${memberships}
  join ${newsItems} on ${newsItems.id} = ${memberships.articleId}
  where ${memberships.storylineId} = ${stories.id} and ${validMembership})`;
const publicStoryline = and(
  eq(stories.status, "published"),
  sql`length(btrim(${stories.overviewEn})) > 0`,
  sql`${articleCount} >= 2`,
);

export async function listStorylines(
  input: {
    q?: string;
    page?: number;
    limit?: number;
    staff?: boolean;
  } = {},
) {
  const q = (input.q ?? "").trim().slice(0, 200);
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const where = and(
    input.staff ? undefined : publicStoryline,
    q
      ? or(
          ilike(stories.titleEn, `%${escaped}%`),
          ilike(stories.titleNl, `%${escaped}%`),
          ilike(stories.overviewEn, `%${escaped}%`),
          ilike(stories.overviewNl, `%${escaped}%`),
        )
      : undefined,
  );
  const [totalRow] = await db
    .select({ total: count() })
    .from(stories)
    .where(where);
  const total = totalRow?.total ?? 0;
  const limit = Math.min(20, Math.max(1, input.limit ?? 12));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.floor(input.page ?? 1) || 1),
  );
  const rows = await db
    .select({ storyline: stories, articleCount, latestAt })
    .from(stories)
    .where(where)
    .orderBy(sql`${latestAt} desc nulls last`, stories.slug)
    .limit(limit)
    .offset((page - 1) * limit);
  return {
    items: rows.map((row) => ({
      ...row.storyline,
      articleCount: row.articleCount,
      latestAt: row.latestAt ? new Date(row.latestAt).toISOString() : null,
    })),
    total,
    page,
    totalPages,
  };
}
export type StorylineSummary = Awaited<
  ReturnType<typeof listStorylines>
>["items"][number];

export async function loadStorylineMemberships(
  storylineId: string,
): Promise<StorylineMembership[]> {
  const rows = await db
    .select({
      article: {
        id: newsItems.id,
        title: newsItems.title,
        url: newsItems.url,
        summary: newsItems.summary,
        author: newsItems.author,
        publishedAt: newsItems.publishedAt,
      },
      membership: memberships,
    })
    .from(memberships)
    .innerJoin(newsItems, eq(newsItems.id, memberships.articleId))
    .where(eq(memberships.storylineId, storylineId));
  return rows.map(({ article, membership }) => ({ ...membership, article }));
}

export async function findStoryline(
  key: { slug: string } | { id: string },
  staff = false,
) {
  const [storyline] = await db
    .select()
    .from(stories)
    .where(
      and(
        "slug" in key ? eq(stories.slug, key.slug) : eq(stories.id, key.id),
        staff ? undefined : publicStoryline,
      ),
    )
    .limit(1);
  if (!storyline) return null;
  const loaded = await loadStorylineMemberships(storyline.id);
  const articles = staff
    ? loaded
    : loaded.filter(
        (m) => m.noteEn && validStorylineEvidence(m.evidence, m.article),
      );
  const outgoing = staff
    ? await db
        .select()
        .from(connections)
        .where(eq(connections.sourceId, storyline.id))
    : [];
  return { ...storyline, articles, connections: outgoing };
}
export type StorylineDetail = NonNullable<
  Awaited<ReturnType<typeof findStoryline>>
>;

/** One batch for the current archive page. Rumor IDs are never passed here. */
export async function articleStorylineLinks(articleIds: string[]) {
  if (!articleIds.length) return [];
  return db
    .select({
      articleId: memberships.articleId,
      slug: stories.slug,
      titleEn: stories.titleEn,
      titleNl: stories.titleNl,
    })
    .from(memberships)
    .innerJoin(stories, eq(stories.id, memberships.storylineId))
    .innerJoin(newsItems, eq(newsItems.id, memberships.articleId))
    .where(
      and(
        inArray(memberships.articleId, articleIds),
        publicStoryline,
        validMembership,
      ),
    )
    .orderBy(stories.slug);
}

export async function relatedStorylines(storylineId: string) {
  const edges = await db
    .select({ edge: connections, target: stories })
    .from(connections)
    .innerJoin(
      stories,
      sql`${stories.id} = case when ${connections.sourceId} = ${storylineId} then ${connections.targetId} else ${connections.sourceId} end`,
    )
    .where(
      and(
        or(
          eq(connections.sourceId, storylineId),
          eq(connections.targetId, storylineId),
        ),
        publicStoryline,
      ),
    )
    .orderBy(stories.slug)
    .limit(40);
  if (!edges.length) return [];
  const ids = [storylineId, ...edges.map((row) => row.target.id)];
  const members = await db
    .select({
      membership: memberships,
      article: {
        id: newsItems.id,
        title: newsItems.title,
        url: newsItems.url,
        summary: newsItems.summary,
        author: newsItems.author,
        publishedAt: newsItems.publishedAt,
      },
    })
    .from(memberships)
    .innerJoin(newsItems, eq(newsItems.id, memberships.articleId))
    .where(inArray(memberships.storylineId, ids));
  const byKey = new Map(
    members.map(({ membership, article }) => [
      `${membership.storylineId}:${membership.articleId}`,
      { ...membership, article },
    ]),
  );
  return edges.flatMap(({ edge, target }) => {
    const from = byKey.get(`${edge.sourceId}:${edge.fromArticleId}`);
    const to = byKey.get(`${edge.targetId}:${edge.toArticleId}`);
    if (
      !from ||
      !to ||
      !from.noteEn ||
      !to.noteEn ||
      !validStorylineEvidence(from.evidence, from.article) ||
      !validStorylineEvidence(to.evidence, to.article)
    )
      return [];
    return [
      {
        ...edge,
        incoming: edge.targetId === storylineId,
        target,
        evidence: [from, to],
      },
    ];
  });
}

export async function searchStorylineArticles(
  q: string,
  requestedPage: number,
) {
  const regex = newsTableSearchRegex(q.trim().slice(0, 200));
  const where = regex
    ? or(
        sql`lower(${newsItems.title}) ~ ${regex}`,
        sql`lower(${newsItems.summary}) ~ ${regex}`,
        sql`lower(coalesce(${newsItems.aiSummary}, '')) ~ ${regex}`,
      )
    : undefined;
  const [row] = await db
    .select({ total: count() })
    .from(newsItems)
    .where(where);
  const totalPages = Math.max(1, Math.ceil((row?.total ?? 0) / 10));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const items = await db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      summary: newsItems.summary,
      url: newsItems.url,
      author: newsItems.author,
      publishedAt: newsItems.publishedAt,
    })
    .from(newsItems)
    .where(where)
    .orderBy(sql`${newsItems.publishedAt} desc nulls last`, newsItems.id)
    .limit(10)
    .offset((page - 1) * 10);
  return { items, page, totalPages };
}

/** Save the whole editorial aggregate atomically; preserve incoming evidence links. */
export async function saveStoryline(input: StorylineInput, userId: string) {
  const id = input.id ?? crypto.randomUUID();
  await db.transaction(async (tx) => {
    if (input.id) {
      const [existing] = await tx
        .select()
        .from(stories)
        .where(eq(stories.id, id))
        .for("update");
      if (!existing) throw new StorylineError("missing", "missing");
      if (existing.revision !== input.revision)
        throw new StorylineError("conflict", "stale");
      if (existing.slug !== input.slug)
        throw new StorylineError("invalid", "immutableSlug");
    }
    const articleIds = input.articles.map((m) => m.articleId);
    const articles = articleIds.length
      ? await tx
          .select()
          .from(newsItems)
          .where(inArray(newsItems.id, articleIds))
          .for("share")
      : [];
    const issues = publicationIssues(input, articles);
    const structural = issues.filter(
      (issue) => !["overview", "articles", "note", "evidence"].includes(issue),
    );
    if (structural.length || (input.status === "published" && issues.length))
      throw new StorylineError(
        "invalid",
        `publish:${(input.status === "published" ? issues : structural).join(",")}`,
      );
    for (const c of input.connections) {
      const [target] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.storylineId, c.targetId),
            eq(memberships.articleId, c.toArticleId),
          ),
        )
        .for("share");
      const [article] = await tx
        .select()
        .from(newsItems)
        .where(eq(newsItems.id, c.toArticleId))
        .for("share");
      if (
        !target ||
        !article ||
        !target.noteEn ||
        !validStorylineEvidence(target.evidence, article)
      )
        throw new StorylineError("invalid", "connectionEvidence");
    }
    const {
      articles: _articles,
      connections: _connections,
      id: _id,
      revision: _revision,
      ...copy
    } = input;
    if (input.id)
      await tx
        .update(stories)
        .set({
          ...copy,
          revision: input.revision + 1,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(stories.id, id));
    else
      await tx
        .insert(stories)
        .values({ ...copy, id, createdBy: userId, updatedBy: userId });
    // Deleting only outgoing connections leaves incoming links to kept memberships intact.
    await tx.delete(connections).where(eq(connections.sourceId, id));
    await tx
      .delete(memberships)
      .where(
        and(
          eq(memberships.storylineId, id),
          articleIds.length
            ? notInArray(memberships.articleId, articleIds)
            : undefined,
        ),
      );
    for (const m of input.articles)
      await tx
        .insert(memberships)
        .values({ ...m, storylineId: id })
        .onConflictDoUpdate({
          target: [memberships.storylineId, memberships.articleId],
          set: { noteEn: m.noteEn, noteNl: m.noteNl, evidence: m.evidence },
        });
    if (input.connections.length)
      await tx
        .insert(connections)
        .values(input.connections.map((c) => ({ ...c, sourceId: id })));
  });
  revalidateNewsTable();
  return { id };
}
