import { sql as payloadSql } from "@payloadcms/db-postgres";
import { inArray, sql } from "drizzle-orm";

import { creditArticlePublication } from "@/server/articles/credit";
import { awardMilestone } from "@/server/badges/engine";

import { idList } from "./article-placement";
import type { Deps } from "./deps";
import {
  inPayloadTransaction,
  type PayloadTransaction,
} from "./payload-writes";

// Two `sql` tags: Payload's transaction runs the drizzle copy bundled with
// the Payload adapter (`payloadSql`); the app database runs the app's own.

/**
 * The issue-publish side of the article channel seam (ADR-0043, decision 6).
 * A magazine article is approved by its editor but stays a draft; it is
 * published when an issue holding it is published (or when it is added to
 * an already published issue). Its author is credited once for it, by
 * `creditPendingMagazineArticles`, after that publish commits. After the
 * credit commits, its author earns the magazine milestone separately; a
 * failed award never fails publishing and the badge backfill recovers it.
 */

const CREDIT_ACTION = "magazine_article.published";

function rowIds(rows: Record<string, unknown>[]): number[] {
  return rows.map((row) => Number(row.id));
}

async function publishIn(
  deps: Deps,
  tx: PayloadTransaction,
  articleIds: number[],
): Promise<number[]> {
  if (articleIds.length === 0) return [];
  // The draft → published claim is one conditional UPDATE: of two
  // concurrent publishes of the same article only one moves it.
  const claimed = rowIds(
    await tx.execute(payloadSql`
      UPDATE "articles" SET "status" = 'published'
      WHERE "id" IN (${idList(articleIds)})
        AND "status" IS DISTINCT FROM 'published'
      RETURNING "id"
    `),
  );
  const publishedAt = new Date().toISOString();
  for (const id of claimed) {
    // Without `draft`, like the trusted-author path in the articles router:
    // Payload builds the update on the latest version, so readers get the
    // latest draft text, not the text of the first save.
    await deps.payload.update({
      collection: "articles",
      id,
      data: { status: "published", publishedAt },
      depth: 0,
      req: tx.req,
    });
  }
  return claimed;
}

/**
 * Publishes placed articles that are not yet published (draft → published
 * only). Idempotent: an article already published is skipped, so a retry
 * after a partial failure completes the rest. Pass `tx` to publish inside
 * the caller's transaction (and on its connection); without it the articles
 * are published in one transaction of their own. Crediting is separate:
 * call `creditPendingMagazineArticles` after the publish commits.
 *
 * Callers pass articles the issue validated (approved, in this magazine,
 * placed in the issue).
 */
export async function publishPlacedArticles(
  deps: Deps,
  articleIds: number[],
  tx?: PayloadTransaction,
): Promise<{ published: number[] }> {
  const ids = [...new Set(articleIds)];
  const published = tx
    ? await publishIn(deps, tx, ids)
    : await inPayloadTransaction(deps.payload, (own) =>
        publishIn(deps, own, ids),
      );
  return { published };
}

/**
 * Credits one published article if it has not been credited yet. The
 * claim (a row in `app.magazine_article_credit`) and the credit (XP,
 * badges, activity) commit in ONE database transaction: a credit that
 * throws rolls the claim back, so the article stays pending and a later run
 * retries it; a claim row that exists means the credit happened. The
 * primary key makes the claim exactly-once: of two runs at once, the second
 * insert waits on the first and then conflicts (or claims, if the first
 * rolled back).
 *
 * The claim lives in its own table, not in a Payload column: Payload never
 * reads or writes it, so no article save (which rewrites its columns from
 * the version it read) and no admin duplicate can reset or copy it.
 */
async function creditOne(deps: Deps, articleId: number): Promise<boolean> {
  const article = await deps.payload.findByID({
    collection: "articles",
    id: articleId,
    depth: 0,
  });
  if (!article.authorId) return false;
  const authorId = article.authorId;

  const credited = await deps.db.transaction(async (t) => {
    const { rows } = await t.execute<{ article_id: number }>(sql`
      INSERT INTO "app"."magazine_article_credit" ("article_id")
      SELECT "id" FROM "public"."articles"
      WHERE "id" = ${articleId} AND "status" = 'published'
      ON CONFLICT ("article_id") DO NOTHING
      RETURNING "article_id"
    `);
    if (rows.length === 0) return false;
    await creditArticlePublication(
      t,
      {
        id: article.id,
        authorId,
        type: article.type,
        title: article.title,
      },
      { action: CREDIT_ACTION },
    );
    return true;
  });
  if (credited) await awardMilestone(deps.db, authorId, "magazine_published");
  return credited;
}

/** Of `userIds`, authors with at least one credited magazine article. */
export async function creditedMagazineAuthorIds(
  db: Deps["db"],
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { rows } = await db.execute<{ author_id: string }>(sql`
    SELECT DISTINCT a."author_id"
    FROM "app"."magazine_article_credit" c
    JOIN "public"."articles" a ON a."id" = c."article_id"
    WHERE ${inArray(sql`a."author_id"`, [...userIds])}
  `);
  return new Set(rows.map((row) => row.author_id));
}

/**
 * Credits the authors of a magazine's published, not yet credited member
 * articles, exactly once each. "Pending" is a property of the article
 * (published, no claim row), not of the issue it sits in now: the query
 * scans the whole magazine, so a credit that failed is retried after the
 * article moved to another issue or left every issue.
 *
 * The guarantee: a failed credit is never dropped, but it is settled only
 * by a later run. Every publish of an issue and every save of a published
 * issue of the same magazine runs it, after that write has committed. A
 * magazine that is never edited again keeps its pending credits until a
 * scheduled sweep (none yet; it would run this same function) or the next
 * edit.
 *
 * Never throws: a failed credit is logged and left pending.
 */
export async function creditPendingMagazineArticles(
  deps: Deps,
  magazineId: number,
): Promise<{ credited: number[]; failed: number[] }> {
  const credited: number[] = [];
  const failed: number[] = [];
  let pending: number[];
  try {
    const { rows } = await deps.db.execute<{ id: number }>(sql`
      SELECT a."id" FROM "public"."articles" a
      LEFT JOIN "app"."magazine_article_credit" c ON c."article_id" = a."id"
      WHERE c."article_id" IS NULL
        AND a."magazine_id" = ${magazineId}
        AND a."status" = 'published'
        AND a."author_type" = 'member'
        AND a."author_id" IS NOT NULL
      ORDER BY a."id"
    `);
    pending = rows.map((row) => Number(row.id));
  } catch (error) {
    console.error("[magazines] could not list articles to credit", {
      magazineId,
      error,
    });
    return { credited, failed };
  }

  for (const articleId of pending) {
    try {
      if (await creditOne(deps, articleId)) credited.push(articleId);
    } catch (error) {
      failed.push(articleId);
      console.error("[magazines] article credit failed; will retry", {
        articleId,
        magazineId,
        action: CREDIT_ACTION,
        error,
      });
    }
  }
  return { credited, failed };
}
