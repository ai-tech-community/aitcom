import { sql } from "@payloadcms/db-postgres";

import type { PayloadTransaction } from "./payload-writes";

/** Records the issue's one announcement inside its publish transaction. */
export async function recordIssueAnnouncement(
  tx: PayloadTransaction,
  input: { issueId: number; magazineId: number; publishedAt: string },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO "app"."magazine_issue_announcement"
      ("issue_id", "magazine_id", "published_at")
    VALUES (${input.issueId}, ${input.magazineId}, ${input.publishedAt}::timestamptz)
    ON CONFLICT ("issue_id") DO NOTHING
  `);
}
