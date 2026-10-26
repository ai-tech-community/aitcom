import { sql as payloadSql } from "@payloadcms/db-postgres";
import { sql } from "drizzle-orm";

import { creditArticlePublication } from "@/server/articles/credit";

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
 * `creditPendingMagazineArticles`, after that publish commits.
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
 * marker and the credit (XP, badges, activity) commit in ONE database
 * transaction: a credit that throws rolls the marker back, so the article
 * stays pending and a later run retries it; a marker that is set means the
 * credit happened. The conditional UPDATE locks the row, so two runs at
 * once credit it once.
 *
 * The marker is written to every version row as well: Payload builds an
 * update on the latest version, and a version without the marker would
 * clear it from the main row on the next save, crediting the author again.
 */
async function creditOne(deps: Deps, articleId: number): Promise<boolean> {
  const article = await deps.payload.findByID({
    collection: "articles",
    id: articleId,
    depth: 0,
  });
  if (!article.authorId) return false;
  const authorId = article.authorId;

  return deps.db.transaction(async (t) => {
    const { rows } = await t.execute<{ credited_at: string }>(sql`
      UPDATE "public"."articles" SET "magazine_credited_at" = now()
      WHERE "id" = ${articleId}
        AND "magazine_credited_at" IS NULL
        AND "status" = 'published'
      RETURNING "magazine_credited_at" AS credited_at
    `);
    const claimed = rows[0];
    if (!claimed) return false;
    await t.execute(sql`
      UPDATE "public"."_articles_v"
      SET "version_magazine_credited_at" = ${claimed.credited_at}
      WHERE "parent_id" = ${articleId}
    `);
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
}

/**
 * Credits the authors of an issue's published, not yet credited member
 * articles: exactly once each, never lost. Never throws: a failed credit is
 * logged and left pending, and the next run (after the next save of the
 * published issue) retries it. Call it after a publish or a save of a
 * published issue has committed. (A scheduled sweep over all pending
 * articles could be added later; slice 1 retries on the next editor
 * action.)
 */
export async function creditPendingMagazineArticles(
  deps: Deps,
  issueId: number,
): Promise<{ credited: number[]; failed: number[] }> {
  const credited: number[] = [];
  const failed: number[] = [];
  let pending: number[];
  try {
    const { rows } = await deps.db.execute<{ id: number }>(sql`
      SELECT "id" FROM "public"."articles"
      WHERE "magazine_issue_id" = ${issueId}
        AND "status" = 'published'
        AND "magazine_credited_at" IS NULL
        AND "author_type" = 'member'
        AND "author_id" IS NOT NULL
      ORDER BY "id"
    `);
    pending = rows.map((row) => Number(row.id));
  } catch (error) {
    console.error("[magazines] could not list articles to credit", {
      issueId,
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
        issueId,
        action: CREDIT_ACTION,
        error,
      });
    }
  }
  return { credited, failed };
}
