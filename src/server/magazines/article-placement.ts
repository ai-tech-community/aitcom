import { sql } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

import type { PayloadClient } from "./deps";
import { magazineError } from "./errors";
import { relationIdOrNull } from "./relation-id";
import type { StoredBlock } from "./items/registry";
import type { PayloadTransaction } from "./payload-writes";

/**
 * Article placement (ADR-0043, decision 6): an article's `magazineIssue`
 * names the one issue whose `article` block holds it. Only the issue
 * service writes it, in the same transaction as the issue's blocks, so the
 * two never disagree.
 */

/** An article block's article and its position in the issue. */
export type PlacedArticle = { articleId: number; itemIndex: number };

/** The articles an issue's blocks hold, in issue order. */
export function placedArticlesOf(blocks: StoredBlock[]): PlacedArticle[] {
  const placed: PlacedArticle[] = [];
  blocks.forEach((block, itemIndex) => {
    if (block.blockType !== "article") return;
    const articleId = relationIdOrNull(block.article);
    if (articleId !== null) placed.push({ articleId, itemIndex });
  });
  return placed;
}

export function idList(ids: readonly number[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

function rowIds(rows: Record<string, unknown>[]): number[] {
  return rows.map((row) => Number(row.id));
}

/**
 * Brings the article's latest version in line with the placement the SQL
 * claim already wrote to the main row (the row reader queries filter on).
 *
 * `draft: true` (preflight F22 as amended in fix round 1): Payload then
 * saves only a new version built on the latest one and never touches the
 * main row, so a pending draft edit of a published article is not pushed
 * live by a move. One update per id: an update by id builds on the latest
 * version, so the pending edit is carried forward, not buried.
 */
async function writePlacement(
  payload: PayloadClient,
  tx: PayloadTransaction,
  articleIds: number[],
  issueId: number | null,
): Promise<void> {
  for (const id of articleIds) {
    await payload.update({
      collection: "articles",
      id,
      data: { magazineIssue: issueId },
      draft: true,
      depth: 0,
      req: tx.req,
    });
  }
}

/**
 * Makes the issue the placement of exactly `articles`: places the new ones,
 * clears the ones that left. Must run inside the transaction that saves the
 * issue's blocks.
 *
 * The claim is one conditional UPDATE, so of two issues racing for the same
 * article one gets it and the other gets `ARTICLE_PLACED` (with the item's
 * index), never both.
 */
export async function syncArticlePlacement(
  payload: PayloadClient,
  tx: PayloadTransaction,
  issueId: number,
  articles: PlacedArticle[],
): Promise<void> {
  const ids = articles.map((a) => a.articleId);

  let placedNow: number[] = [];
  if (ids.length > 0) {
    placedNow = rowIds(
      await tx.execute(sql`
        UPDATE "articles" SET "magazine_issue_id" = ${issueId}
        WHERE "id" IN (${idList(ids)}) AND "magazine_issue_id" IS NULL
        RETURNING "id"
      `),
    );
    const owned = new Set(
      rowIds(
        await tx.execute(sql`
          SELECT "id" FROM "articles"
          WHERE "id" IN (${idList(ids)}) AND "magazine_issue_id" = ${issueId}
        `),
      ),
    );
    const taken = articles.find((a) => !owned.has(a.articleId));
    if (taken) {
      throw magazineError("ARTICLE_PLACED", { itemIndex: taken.itemIndex });
    }
  }

  const leftNow = rowIds(
    await tx.execute(sql`
      UPDATE "articles" SET "magazine_issue_id" = NULL
      WHERE "magazine_issue_id" = ${issueId}
      ${ids.length > 0 ? sql`AND "id" NOT IN (${idList(ids)})` : sql``}
      RETURNING "id"
    `),
  );

  // The claim wrote the main rows; the latest versions (what `draft: true`
  // reads) now get the same values.
  await writePlacement(payload, tx, placedNow, issueId);
  await writePlacement(payload, tx, leftNow, null);
}

/** Clears every placement in an issue (before the issue is deleted). */
export async function clearArticlePlacement(
  payload: PayloadClient,
  tx: PayloadTransaction,
  issueId: number,
): Promise<void> {
  await syncArticlePlacement(payload, tx, issueId, []);
}

/**
 * The guard for deleting an article, run by the Articles `beforeDelete`
 * hook so every delete path gets it: an article an issue holds cannot be
 * deleted (the issue's block keeps a required reference to it), so the
 * delete is refused with `ARTICLE_PLACED` until an editor takes it out of
 * the issue. Refusing beats unplacing silently: removing a story from an
 * issue is the editor's call, not a side effect of the author's delete.
 */
export async function assertArticleNotPlaced(
  payload: PayloadClient,
  articleId: number,
  req?: Partial<PayloadRequest>,
): Promise<void> {
  const { totalDocs } = await payload.count({
    collection: "magazine-issues",
    where: { "items.article": { equals: articleId } },
    req,
  });
  if (totalDocs > 0) throw magazineError("ARTICLE_PLACED");
}
