import { after } from "next/server";
import type { PayloadRequest } from "payload";

import { awardMilestone, evaluateBadges, type EarnOptions } from "./engine";
import type { BadgeDb } from "./metrics";

interface ApprovedArticle {
  authorId: string;
  type: string | null | undefined;
}

/**
 * An article of this author was approved and published: the Writer track
 * may have moved, and a tutorial is the Tutorial creator milestone.
 */
export async function onArticleApproved(
  db: BadgeDb,
  article: ApprovedArticle,
  options: EarnOptions = {},
): Promise<void> {
  await evaluateBadges(db, article.authorId, ["writer"], options);
  if (article.type === "tutorial") {
    await awardMilestone(db, article.authorId, "tutorial_creator");
  }
}

/**
 * From the Articles after-change hook, which runs inside Payload's save
 * transaction. Payload's transaction cannot carry app-table writes (its
 * drizzle instance has neither the app schema nor its snake_case column
 * mapping), and Payload has no after-commit hook. So within a request the
 * badges are earned after the response, by which time Payload has
 * committed the save; a rolled-back save earns nothing. Outside a request
 * (scripts, tests) there is no later point: it runs now, reading through
 * the save's `req` so the article being approved is counted.
 */
export async function onArticleApprovedAfterSave(
  db: BadgeDb,
  article: ApprovedArticle,
  req: PayloadRequest,
): Promise<void> {
  try {
    after(() => onArticleApproved(db, article));
  } catch {
    await onArticleApproved(db, article, { req });
  }
}
