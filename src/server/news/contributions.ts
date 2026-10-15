import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  applyStoryClaim,
  PUBLISHED_POINTS,
  contributionStreak,
  contributionWeekStart,
  isBreakingTopic,
  publishedContributionBadges,
  storyRegion,
  topicsCoveredToday,
  utcDayKey,
  type NewsContributionBadge,
} from "@/lib/news/contributions";
import { contributorBoardEntry } from "@/lib/news/contributor-board";
import { awardMilestone } from "@/server/badges/engine";
import { db } from "@/server/db";
import {
  agentDrafts,
  agentProfiles,
  memberProfiles,
  newsContributions,
  newsItems,
  newsStorylineArticles,
  newsStorylines,
  user,
} from "@/server/db/schema";

import { listWeeklyStoryTopics } from "./weekly-topics";

export type { ContributorBoardEntry as ContributorBoardRow } from "@/lib/news/contributor-board";

async function awardNewsBadges(
  userId: string,
  badges: readonly NewsContributionBadge[],
) {
  for (const badge of badges) {
    await awardMilestone(db, userId, badge);
  }
}

export async function claimWeeklyTopic(args: {
  userId: string;
  topicKey: string;
  title: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const topics = await listWeeklyStoryTopics(now);
  const topic = topics.find(
    (item) => item.topicKey === args.topicKey && item.title === args.title,
  );
  if (!topic) return { ok: false as const, reason: "topic" as const };
  const result = await applyStoryClaim(
    {
      async insertClaim(row) {
        const inserted = await db
          .insert(newsContributions)
          .values({ ...row, kind: "claim" })
          .onConflictDoNothing()
          .returning({ id: newsContributions.id });
        return inserted.length > 0 ? "inserted" : "exists";
      },
      async insertBreaking(row) {
        const inserted = await db
          .insert(newsContributions)
          .values({ ...row, kind: "breaking" })
          .onConflictDoNothing()
          .returning({ id: newsContributions.id });
        return inserted.length > 0 ? "inserted" : "exists";
      },
      async existingClaim(userId, topicKey) {
        const [row] = await db
          .select({ expiresAt: newsContributions.expiresAt })
          .from(newsContributions)
          .where(
            and(
              eq(newsContributions.userId, userId),
              eq(newsContributions.topicKey, topicKey),
              eq(newsContributions.kind, "claim"),
            ),
          )
          .limit(1);
        return row?.expiresAt ? { expiresAt: row.expiresAt } : null;
      },
    },
    {
      userId: args.userId,
      topicKey: topic.topicKey,
      title: topic.title,
      now,
      breaking: isBreakingTopic(new Date(topic.newestAt), now),
    },
  );
  if (result.firstScoop) {
    await awardNewsBadges(args.userId, ["news_first_scoop"]);
  }
  return { ok: true as const, ...result };
}

export async function listMemberClaims(userId: string) {
  return db
    .select({
      topicKey: newsContributions.topicKey,
      title: newsContributions.title,
      expiresAt: newsContributions.expiresAt,
      createdAt: newsContributions.createdAt,
    })
    .from(newsContributions)
    .where(
      and(
        eq(newsContributions.userId, userId),
        eq(newsContributions.kind, "claim"),
      ),
    )
    .orderBy(desc(newsContributions.createdAt))
    .limit(20);
}

export async function storyCoverageToday(now = new Date()) {
  const topics = await listWeeklyStoryTopics(now);
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const claims =
    topics.length === 0
      ? []
      : await db
          .select({ topicKey: newsContributions.topicKey })
          .from(newsContributions)
          .where(
            and(
              eq(newsContributions.kind, "claim"),
              gte(newsContributions.createdAt, start),
            ),
          );
  return topicsCoveredToday(
    topics.map((topic) => topic.topicKey),
    claims.map((claim) => claim.topicKey),
  );
}

export async function listWeeklyContributorBoard(now = new Date(), limit = 10) {
  const start = contributionWeekStart(now);
  const rows = await db
    .select({
      userId: newsContributions.userId,
      points: sql<number>`sum(${newsContributions.points})::int`,
      displayName: memberProfiles.displayName,
      isPublic: memberProfiles.isPublic,
      hiddenFromPublic: memberProfiles.hiddenFromPublic,
      image: user.image,
      agentName: agentProfiles.name,
      agentVisibility: agentProfiles.visibilityMode,
    })
    .from(newsContributions)
    .innerJoin(
      memberProfiles,
      eq(memberProfiles.userId, newsContributions.userId),
    )
    .innerJoin(user, eq(user.id, newsContributions.userId))
    .leftJoin(
      agentProfiles,
      eq(agentProfiles.ownerId, newsContributions.userId),
    )
    .where(
      and(
        gte(newsContributions.createdAt, start),
        eq(memberProfiles.isPublic, true),
        eq(memberProfiles.hiddenFromPublic, false),
        sql`char_length(btrim(${memberProfiles.displayName})) > 0`,
      ),
    )
    .groupBy(
      newsContributions.userId,
      memberProfiles.displayName,
      memberProfiles.isPublic,
      memberProfiles.hiddenFromPublic,
      user.image,
      agentProfiles.name,
      agentProfiles.visibilityMode,
    )
    .orderBy(
      desc(sql`sum(${newsContributions.points})`),
      asc(sql`min(${newsContributions.createdAt})`),
    )
    .limit(limit);
  return rows.flatMap((row) => {
    const entry = contributorBoardEntry(row);
    return entry ? [entry] : [];
  });
}

export async function readContributionStreak(userId: string, now = new Date()) {
  const rows = await db
    .select({ createdAt: newsContributions.createdAt })
    .from(newsContributions)
    .where(
      and(
        eq(newsContributions.userId, userId),
        inArray(newsContributions.kind, ["claim", "published"]),
      ),
    );
  return contributionStreak(
    rows.map((row) => utcDayKey(row.createdAt)),
    utcDayKey(now),
  );
}

async function publishedCounts(
  userId: string,
  region: "eu" | "il" | "asia" | null,
) {
  const [published] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(newsContributions)
    .where(
      and(
        eq(newsContributions.userId, userId),
        eq(newsContributions.kind, "published"),
      ),
    );
  const [regional] = region
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(newsContributions)
        .where(
          and(
            eq(newsContributions.userId, userId),
            eq(newsContributions.kind, "published"),
            eq(newsContributions.region, region),
          ),
        )
    : [{ n: 0 }];
  return {
    publishedCount: Number(published?.n ?? 0),
    regionCount: Number(regional?.n ?? 0),
  };
}

/** Credit the member whose agent proposal became this published story. */
export async function recordPublishedStoryCredit(
  storylineId: string,
): Promise<"credited" | "exists" | "skipped"> {
  const [story] = await db
    .select({
      id: newsStorylines.id,
      slug: newsStorylines.slug,
      titleEn: newsStorylines.titleEn,
      status: newsStorylines.status,
    })
    .from(newsStorylines)
    .where(eq(newsStorylines.id, storylineId))
    .limit(1);
  if (story?.status !== "published") return "skipped";
  const [draft] = await db
    .select({ ownerId: agentDrafts.ownerId })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "approved"),
        sql`${agentDrafts.metadata}->>'savedStorylineId' = ${storylineId}`,
      ),
    )
    .limit(1);
  if (!draft?.ownerId) return "skipped";
  const articles = await db
    .select({ title: newsItems.title })
    .from(newsStorylineArticles)
    .innerJoin(newsItems, eq(newsItems.id, newsStorylineArticles.articleId))
    .where(eq(newsStorylineArticles.storylineId, storylineId));
  const region = storyRegion(articles.map((article) => article.title));
  const inserted = await db
    .insert(newsContributions)
    .values({
      userId: draft.ownerId,
      topicKey: story.slug,
      title: story.titleEn.slice(0, 200),
      kind: "published",
      points: PUBLISHED_POINTS,
      storylineId: story.id,
      region,
    })
    .onConflictDoNothing()
    .returning({ id: newsContributions.id });
  const counts = await publishedCounts(draft.ownerId, region);
  await awardNewsBadges(
    draft.ownerId,
    publishedContributionBadges({ ...counts, region }),
  );
  return inserted.length > 0 ? "credited" : "exists";
}

/** Idempotent. Stories with no contributing member are left untouched. */
export async function backfillPublishedContributions(limit = 25) {
  const rows = await db
    .select({ id: newsStorylines.id })
    .from(newsStorylines)
    .innerJoin(
      agentDrafts,
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "approved"),
        sql`${agentDrafts.metadata}->>'savedStorylineId' = ${newsStorylines.id}`,
      ),
    )
    .leftJoin(
      newsContributions,
      and(
        eq(newsContributions.storylineId, newsStorylines.id),
        eq(newsContributions.kind, "published"),
      ),
    )
    .where(
      and(eq(newsStorylines.status, "published"), isNull(newsContributions.id)),
    )
    .limit(limit);
  let credited = 0;
  for (const row of rows) {
    const result = await recordPublishedStoryCredit(row.id);
    if (result === "credited") credited += 1;
  }
  return { scanned: rows.length, credited };
}
