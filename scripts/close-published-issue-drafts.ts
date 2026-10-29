/**
 * Close agent reviews whose magazine issue is already published.
 *
 * The issue button used to publish the issue and leave app.agent_draft
 * pending, so save-magazine-article kept reporting "waiting for review".
 *
 * Dry run (prints the rows, writes nothing):
 *   pnpm exec tsx --env-file=.env scripts/close-published-issue-drafts.ts
 *
 * Apply:
 *   pnpm exec tsx --env-file=.env scripts/close-published-issue-drafts.ts --write
 *
 * The env file's DATABASE_URL decides which database this touches.
 */
import { db } from "@/server/db";
import { closeIssueDraftWrites } from "@/server/magazines/article-review-lock";
import {
  closeStalePublishedIssueDrafts,
  listStalePublishedIssueDrafts,
} from "@/server/magazines/close-issue-drafts";

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(unset)";
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const write = closeIssueDraftWrites(process.argv.slice(2));
  console.log(
    `${write ? "WRITE" : "Dry run"} against database host ${databaseHost()}`,
  );
  const stale = await listStalePublishedIssueDrafts(db);
  if (stale.length === 0) {
    console.log("No pending issue reviews belong to a published issue.");
    return;
  }
  for (const row of stale) {
    console.log(`${row.id}\tissue ${row.issueId}\t${row.title}`);
  }
  console.log(
    `${stale.length} pending issue review${stale.length === 1 ? "" : "s"} would be marked published.`,
  );
  if (!write) {
    console.log("Pass --write to mark those reviews published.");
    return;
  }
  const closed = await closeStalePublishedIssueDrafts(
    db,
    stale.map((row) => row.id),
  );
  console.log(`Marked ${closed} issue reviews published.`);
}

main().catch((error: unknown) => {
  console.error("Close published issue drafts failed:", error);
  process.exit(1);
});
