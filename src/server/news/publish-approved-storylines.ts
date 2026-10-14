import { and, eq, sql } from "drizzle-orm";
import { storylineInputSchema } from "@/lib/news/storylines";
import { db } from "@/server/db";
import {
  agentDrafts,
  newsStorylines as stories,
  newsStorylineArticles as memberships,
  newsStorylineConnections as connections,
} from "@/server/db/schema";
import { recordPublishedStoryCredit } from "./contributions";
import { saveStoryline, StorylineError } from "./storylines";

export type PublishedEditorialDraft = {
  draftId: string;
  id: string;
  slug: string;
};

export type SkippedEditorialDraft = PublishedEditorialDraft & {
  reason: string;
};

/**
 * Publish editorial drafts that an earlier approval saved but did not publish.
 * Safe to run again: a story already published no longer matches, and a story
 * that cannot be published is left unchanged.
 */
export async function publishApprovedEditorialDrafts(limit = 25): Promise<{
  scanned: number;
  published: PublishedEditorialDraft[];
  skipped: SkippedEditorialDraft[];
}> {
  const rows = await db
    .select({
      id: stories.id,
      slug: stories.slug,
      titleEn: stories.titleEn,
      titleNl: stories.titleNl,
      overviewEn: stories.overviewEn,
      overviewNl: stories.overviewNl,
      questionsEn: stories.questionsEn,
      questionsNl: stories.questionsNl,
      revision: stories.revision,
      updatedBy: stories.updatedBy,
      createdBy: stories.createdBy,
      draftId: agentDrafts.id,
      reviewedBy: sql<string | null>`${agentDrafts.metadata}->>'reviewedBy'`,
    })
    .from(stories)
    .innerJoin(
      agentDrafts,
      and(
        eq(agentDrafts.type, "news_storyline"),
        eq(agentDrafts.status, "approved"),
        sql`${agentDrafts.metadata}->>'savedStorylineId' = ${stories.id}`,
      ),
    )
    .where(eq(stories.status, "draft"))
    .limit(limit);

  const published: PublishedEditorialDraft[] = [];
  const skipped: SkippedEditorialDraft[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const identity = { draftId: row.draftId, id: row.id, slug: row.slug };
    const actor = row.updatedBy ?? row.createdBy ?? row.reviewedBy;
    if (!actor) {
      skipped.push({ ...identity, reason: "noEditor" });
      continue;
    }
    const articles = await db
      .select({
        articleId: memberships.articleId,
        noteEn: memberships.noteEn,
        noteNl: memberships.noteNl,
        evidence: memberships.evidence,
      })
      .from(memberships)
      .where(eq(memberships.storylineId, row.id));
    const links = await db
      .select({
        targetId: connections.targetId,
        relation: connections.relation,
        explanationEn: connections.explanationEn,
        explanationNl: connections.explanationNl,
        fromArticleId: connections.fromArticleId,
        toArticleId: connections.toArticleId,
      })
      .from(connections)
      .where(eq(connections.sourceId, row.id));
    const parsed = storylineInputSchema.safeParse({
      id: row.id,
      slug: row.slug,
      titleEn: row.titleEn,
      titleNl: row.titleNl,
      overviewEn: row.overviewEn,
      overviewNl: row.overviewNl,
      questionsEn: row.questionsEn ?? [],
      questionsNl: row.questionsNl ?? [],
      status: "published",
      revision: row.revision,
      articles,
      connections: links,
    });
    if (!parsed.success) {
      skipped.push({ ...identity, reason: "invalid" });
      continue;
    }
    try {
      await saveStoryline(parsed.data, actor);
    } catch (err) {
      skipped.push({
        ...identity,
        reason: err instanceof StorylineError ? err.message : "failed",
      });
      continue;
    }
    published.push(identity);
    await recordPublishedStoryCredit(row.id).catch((creditErr: unknown) => {
      console.error("news: contribution credit failed", creditErr);
    });
  }

  return { scanned: rows.length, published, skipped };
}
