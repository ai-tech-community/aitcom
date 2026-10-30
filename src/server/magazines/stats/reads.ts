import { isNotNull, isNull, sql } from "drizzle-orm";

import type { ReadEvent } from "@/lib/magazines/stats";
import { magazineReads } from "@/server/db/schema";

import type { Deps } from "../deps";

export type RecordReadInput = {
  magazineId: number;
  issueId: number;
  articleId: number | null;
  readerKey: string;
  event: ReadEvent;
  now: Date;
};

/** The only writer of magazine_read; each page and reader share one tally. */
export async function recordMagazineRead(
  db: Deps["db"],
  input: RecordReadInput,
): Promise<void> {
  const view = input.event === "view";
  const issuePage = input.articleId === null;
  await db
    .insert(magazineReads)
    .values({
      magazineId: input.magazineId,
      issueId: input.issueId,
      articleId: input.articleId,
      readerKey: input.readerKey,
      views: view ? 1 : 0,
      firstSeenAt: input.now,
      lastSeenAt: input.now,
      readToEndAt: view ? null : input.now,
    })
    .onConflictDoUpdate({
      target: issuePage
        ? [magazineReads.issueId, magazineReads.readerKey]
        : [
            magazineReads.issueId,
            magazineReads.articleId,
            magazineReads.readerKey,
          ],
      targetWhere: issuePage
        ? isNull(magazineReads.articleId)
        : isNotNull(magazineReads.articleId),
      set: view
        ? { views: sql`${magazineReads.views} + 1`, lastSeenAt: input.now }
        : {
            readToEndAt: sql`COALESCE(${magazineReads.readToEndAt}, ${input.now})`,
          },
    });
}
