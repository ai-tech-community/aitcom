import {
  and,
  eq,
  inArray,
  notInArray,
  or,
  sql,
  ilike,
  count,
  gte,
} from "drizzle-orm";
import { newsTableSearchRegex } from "@/lib/news/table-query";
import { db } from "@/server/db";
import { escapeLike } from "@/server/db/escape-like";
import { storylineVoteChoice } from "@/lib/news/storyline-vote";
import {
  storylineCredit,
  type StorylineCredit,
} from "@/lib/news/storyline-credit";
import {
  newsItems,
  agentDrafts,
  agentProfiles,
  memberProfiles,
  user,
  newsStorylines as stories,
  newsStorylineArticles as memberships,
  newsStorylineConnections as connections,
  newsStorylineVotes,
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
export const publicStoryline = and(
  eq(stories.status, "published"),
  sql`length(btrim(${stories.overviewEn})) > 0`,
  sql`${articleCount} >= 2`,
);

/** Live story cards, including unpublished stories for editor markers. */
export type StorylineCard = {
  id: string;
  slug: string;
  titleEn: string;
  titleNl: string;
  overviewEn: string;
  overviewNl: string;
  articleCount: number;
  latestAt: Date | null;
  isPublic: boolean;
};

/** One query for all referenced stories; publication uses the story page's rule. */
export async function loadStorylineCards(
  ids: readonly string[],
  database: typeof db = db,
): Promise<Map<string, StorylineCard>> {
  if (ids.length === 0) return new Map();
  // Keep every computed SQL column wrapped, as in listStorylines below:
  // otherwise Drizzle drops the table names inside correlated subqueries.
  const rows = await database
    .select({
      id: stories.id,
      slug: stories.slug,
      titleEn: stories.titleEn,
      titleNl: stories.titleNl,
      overviewEn: stories.overviewEn,
      overviewNl: stories.overviewNl,
      articleCount: sql<number>`${articleCount}`,
      latestAt: sql<Date | null>`${latestAt}`,
      isPublic: sql<boolean>`(${publicStoryline!})`,
    })
    .from(stories)
    .where(inArray(stories.id, [...ids]));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        latestAt: row.latestAt ? new Date(row.latestAt) : null,
      },
    ]),
  );
}

const storylineScore = sql<number>`(select coalesce(sum(${newsStorylineVotes.value}), 0)::int from ${newsStorylineVotes} where ${newsStorylineVotes.storyId} = ${stories.id})`;

function storylineTextWhere(query: string) {
  const q = query.trim().slice(0, 200);
  const escaped = escapeLike(q);
  return q
    ? or(
        ilike(stories.titleEn, `%${escaped}%`),
        ilike(stories.titleNl, `%${escaped}%`),
        ilike(stories.overviewEn, `%${escaped}%`),
        ilike(stories.overviewNl, `%${escaped}%`),
      )
    : undefined;
}

/** One bounded public search for pickers, without archive pagination or credits. */
export async function searchPublicStorylines(
  query: string,
  limit: number,
  database: typeof db = db,
  exclude: readonly string[] = [],
): Promise<StorylineCard[]> {
  const rows = await database
    .select({
      id: stories.id,
      slug: stories.slug,
      titleEn: stories.titleEn,
      titleNl: stories.titleNl,
      overviewEn: stories.overviewEn,
      overviewNl: stories.overviewNl,
      articleCount: sql<number>`${articleCount}`,
      latestAt: sql<Date | null>`${latestAt}`,
    })
    .from(stories)
    .where(
      and(
        publicStoryline,
        storylineTextWhere(query),
        exclude.length ? notInArray(stories.id, [...exclude]) : undefined,
      ),
    )
    .orderBy(
      sql`${storylineScore} desc`,
      sql`${latestAt} desc nulls last`,
      stories.slug,
    )
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    latestAt: row.latestAt ? new Date(row.latestAt) : null,
    isPublic: true,
  }));
}

/** Public topic matches, newest valid source first, then score and slug. */
export async function suggestPublicStorylines(
  input: {
    topics: readonly string[];
    since: Date;
    limit: number;
    exclude: readonly string[];
  },
  database: typeof db = db,
): Promise<(StorylineCard & { matchedTopic: string })[]> {
  if (input.topics.length === 0 || input.limit <= 0) return [];
  const matches = input.topics.map((topic) => {
    const pattern = `%${escapeLike(topic)}%`;
    return or(
      ilike(stories.titleEn, pattern),
      ilike(stories.titleNl, pattern),
      ilike(stories.overviewEn, pattern),
      ilike(stories.overviewNl, pattern),
    )!;
  });
  const matchedTopic = sql<string>`case ${sql.join(
    matches.map(
      (match, index) => sql`when ${match} then ${input.topics[index]}`,
    ),
    sql` `,
  )} end`;
  const rows = await database
    .select({
      id: stories.id,
      slug: stories.slug,
      titleEn: stories.titleEn,
      titleNl: stories.titleNl,
      overviewEn: stories.overviewEn,
      overviewNl: stories.overviewNl,
      articleCount: sql<number>`${articleCount}`,
      latestAt: sql<Date | null>`${latestAt}`,
      matchedTopic,
    })
    .from(stories)
    .where(
      and(
        publicStoryline,
        or(...matches),
        gte(latestAt, input.since),
        input.exclude.length
          ? notInArray(stories.id, [...input.exclude])
          : undefined,
      ),
    )
    .orderBy(sql`${latestAt} desc`, sql`${storylineScore} desc`, stories.slug)
    .limit(input.limit);
  return rows.map((row) => ({
    ...row,
    latestAt: row.latestAt ? new Date(row.latestAt) : null,
    isPublic: true,
  }));
}

export async function listStorylines(
  input: {
    q?: string;
    page?: number;
    limit?: number;
    staff?: boolean;
    viewerId?: string;
  } = {},
) {
  const where = and(
    input.staff ? undefined : publicStoryline,
    storylineTextWhere(input.q ?? ""),
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
  const myVote = input.viewerId
    ? sql<
        number | null
      >`(select ${newsStorylineVotes.value} from ${newsStorylineVotes} where ${newsStorylineVotes.storyId} = ${stories.id} and ${newsStorylineVotes.userId} = ${input.viewerId} limit 1)`
    : sql<number | null>`null::int`;
  // Wrap the subqueries. A bare SQL field in this select list makes Drizzle
  // reprint the columns without table names, so the article count matches
  // the wrong id and the page shows zero articles.
  const rows = await db
    .select({
      storyline: stories,
      articleCount: sql<number>`${articleCount}`,
      latestAt: sql<Date | null>`${latestAt}`,
      score: sql<number>`${storylineScore}`,
      myVote: sql<number | null>`${myVote}`,
    })
    .from(stories)
    .where(where)
    .orderBy(
      ...(input.staff
        ? ([sql`${latestAt} desc nulls last`, stories.slug] as const)
        : ([
            sql`${storylineScore} desc`,
            sql`${latestAt} desc nulls last`,
            stories.slug,
          ] as const)),
    )
    .limit(limit)
    .offset((page - 1) * limit);
  const credits = await loadStorylineCredits(
    rows.map((row) => row.storyline.id),
  ).catch((err: unknown) => {
    console.error("news: story credits unavailable", err);
    return new Map<string, StorylineCredit>();
  });
  return {
    items: rows.map((row) => ({
      ...row.storyline,
      articleCount: row.articleCount,
      latestAt: row.latestAt ? new Date(row.latestAt).toISOString() : null,
      score: Number(row.score ?? 0),
      myVote: storylineVoteChoice(row.myVote),
      credit: credits.get(row.storyline.id) ?? {
        human: null,
        agentName: null,
      },
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
  viewerId?: string,
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
  const [sourceAgent] = await db
    .select({
      name: agentProfiles.name,
      visibilityMode: agentProfiles.visibilityMode,
      ownerId: agentDrafts.ownerId,
      displayName: memberProfiles.displayName,
      isPublic: memberProfiles.isPublic,
      hiddenFromPublic: memberProfiles.hiddenFromPublic,
    })
    .from(agentDrafts)
    .innerJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, agentDrafts.ownerId))
    .where(
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "approved"),
        sql`${agentDrafts.metadata}->>'savedStorylineId' = ${storyline.id}`,
      ),
    )
    .limit(1);
  const credit = sourceAgent
    ? storylineCredit({
        ownerId: sourceAgent.ownerId,
        displayName: sourceAgent.displayName,
        isPublic: sourceAgent.isPublic,
        hiddenFromPublic: sourceAgent.hiddenFromPublic,
        agentName: sourceAgent.name,
        agentVisibility: sourceAgent.visibilityMode,
      })
    : null;
  const proposedBy = sourceAgent ? { name: credit?.agentName ?? null } : null;
  const contributor = credit?.human
    ? { name: credit.human.name, profilePath: credit.human.profilePath }
    : null;
  const [votes] = await db
    .select({
      score: sql<number>`coalesce(sum(${newsStorylineVotes.value}), 0)::int`,
      mine: viewerId
        ? sql<
            number | null
          >`max(${newsStorylineVotes.value}) filter (where ${newsStorylineVotes.userId} = ${viewerId})`
        : sql<number | null>`null::int`,
    })
    .from(newsStorylineVotes)
    .where(eq(newsStorylineVotes.storyId, storyline.id));
  return {
    ...storyline,
    articles,
    connections: outgoing,
    proposedBy,
    contributor,
    score: Number(votes?.score ?? 0),
    myVote: storylineVoteChoice(votes?.mine),
  };
}
export type StorylineDetail = NonNullable<
  Awaited<ReturnType<typeof findStoryline>>
>;

/** Approved proposal credits for the stories on one page. Newest draft wins. */
export async function loadStorylineCredits(storyIds: string[]) {
  const credits = new Map<string, StorylineCredit>();
  if (storyIds.length === 0) return credits;
  const rows = await db
    .select({
      storyId: sql<string>`${agentDrafts.metadata}->>'savedStorylineId'`,
      createdAt: agentDrafts.createdAt,
      ownerId: agentDrafts.ownerId,
      displayName: memberProfiles.displayName,
      isPublic: memberProfiles.isPublic,
      hiddenFromPublic: memberProfiles.hiddenFromPublic,
      image: user.image,
      agentName: agentProfiles.name,
      agentVisibility: agentProfiles.visibilityMode,
    })
    .from(agentDrafts)
    .innerJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, agentDrafts.ownerId))
    .leftJoin(user, eq(user.id, agentDrafts.ownerId))
    .where(
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "approved"),
        inArray(sql`${agentDrafts.metadata}->>'savedStorylineId'`, storyIds),
      ),
    );
  const ordered = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  for (const row of ordered) {
    if (!row.storyId || credits.has(row.storyId)) continue;
    credits.set(row.storyId, storylineCredit(row));
  }
  return credits;
}

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
    let sourceDraft: typeof agentDrafts.$inferSelect | undefined;
    if (input.sourceDraftId) {
      if (input.id) throw new StorylineError("invalid", "sourceDraft");
      [sourceDraft] = await tx
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.id, input.sourceDraftId),
            eq(agentDrafts.type, "news_storyline"),
            eq(agentDrafts.status, "pending"),
          ),
        )
        .for("update");
      if (!sourceDraft)
        throw new StorylineError("conflict", "sourceDraftReviewed");
    }

    let existingPublishedAt: Date | null = null;
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
      existingPublishedAt = existing.publishedAt ?? null;
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
      sourceDraftId: _sourceDraftId,
      revision: _revision,
      ...copy
    } = input;
    const publishedAt =
      input.status === "published"
        ? (existingPublishedAt ?? new Date())
        : existingPublishedAt;
    if (input.id)
      await tx
        .update(stories)
        .set({
          ...copy,
          publishedAt,
          revision: input.revision + 1,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(stories.id, id));
    else
      await tx.insert(stories).values({
        ...copy,
        id,
        publishedAt,
        createdBy: userId,
        updatedBy: userId,
      });
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
    if (sourceDraft)
      await tx
        .update(agentDrafts)
        .set({
          status: "approved",
          metadata: {
            ...sourceDraft.metadata,
            savedStorylineId: id,
            reviewedBy: userId,
            reviewedAt: new Date().toISOString(),
          },
        })
        .where(
          and(
            eq(agentDrafts.id, sourceDraft.id),
            eq(agentDrafts.status, "pending"),
          ),
        );
  });
  revalidateNewsTable();
  return { id };
}
