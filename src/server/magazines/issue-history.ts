import { sql as payloadSql } from "@payloadcms/db-postgres";
import { desc, eq, sql } from "drizzle-orm";

import type {
  IssueHistoryDetail,
  IssueHistoryEntry,
} from "@/lib/magazines/issue-history";
import type { IssueStatus } from "@/lib/magazines/values";
import { magazineIssueHistory, user } from "@/server/db/schema";

import type { Deps } from "./deps";
import type { PayloadTransaction } from "./payload-writes";

export const ITEMS_CHANGED_QUIET_MINUTES = 60;
export const HISTORY_LIMIT = 30;

export type HistoryWrite = {
  magazineId: number;
  issue: { id: number; number: number; title: string } | null;
  /** Resolved by the caller: via:auto and system actors have no person id. */
  actorId: string | null;
  detail: IssueHistoryDetail;
};

/** Writes on the caller's connection, with one conditional insert for quick saves. */
export async function recordIssueHistory(
  tx: PayloadTransaction,
  entry: HistoryWrite,
): Promise<void> {
  const createdAt = payloadSql`CURRENT_TIMESTAMP`;
  const actorKind = entry.actorId === null ? "automatic" : "person";
  const insert =
    entry.detail.event === "items_changed"
      ? payloadSql`NOT EXISTS (
        SELECT 1 FROM (
          SELECT "event", "actor_id", "created_at"
          FROM "app"."magazine_issue_history"
          WHERE "magazine_id" = ${entry.magazineId}
            AND "issue_id" = ${entry.issue?.id ?? null}
          ORDER BY "created_at" DESC, "id" DESC
          LIMIT 1
        ) AS latest
        WHERE latest."event" = 'items_changed'
          AND latest."actor_id" IS NOT DISTINCT FROM ${entry.actorId}
          AND latest."created_at" > ${createdAt}
            - ${ITEMS_CHANGED_QUIET_MINUTES} * interval '1 minute'
      )`
      : payloadSql`true`;
  await tx.execute(payloadSql`
    INSERT INTO "app"."magazine_issue_history"
      ("magazine_id", "issue_id", "issue_number", "issue_title", "event",
       "origin", "actor_id", "actor_kind", "detail", "created_at")
    SELECT ${entry.magazineId}, ${entry.issue?.id ?? null},
      ${entry.issue?.number ?? null}, ${entry.issue?.title ?? null},
      ${entry.detail.event},
      ${entry.detail.event === "published" ? entry.detail.origin : null},
      ${entry.actorId}, ${actorKind}, ${JSON.stringify(entry.detail)}::jsonb, ${createdAt}
    WHERE ${insert}
  `);
}

/** Recent editor history; snapshots survive deletion while status stays live. */
export async function listIssueHistory(
  db: Deps["db"],
  magazineId: number,
): Promise<IssueHistoryEntry[]> {
  const rows = await db
    .select({
      id: magazineIssueHistory.id,
      detail: magazineIssueHistory.detail,
      actorKind: magazineIssueHistory.actorKind,
      actorName: user.name,
      issueId: magazineIssueHistory.issueId,
      issueNumber: magazineIssueHistory.issueNumber,
      issueTitle: magazineIssueHistory.issueTitle,
      issueStatus: sql<IssueStatus | null>`"issue"."status"`,
      createdAt: magazineIssueHistory.createdAt,
    })
    .from(magazineIssueHistory)
    .leftJoin(user, eq(user.id, magazineIssueHistory.actorId))
    .leftJoin(
      sql`"public"."magazine_issues" AS "issue"`,
      sql`"issue"."id" = ${magazineIssueHistory.issueId}`,
    )
    .where(eq(magazineIssueHistory.magazineId, magazineId))
    .orderBy(
      desc(magazineIssueHistory.createdAt),
      desc(magazineIssueHistory.id),
    )
    .limit(HISTORY_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    detail: row.detail,
    actorKind: row.actorKind,
    actorName: row.actorName,
    issue:
      row.issueId === null &&
      row.issueNumber === null &&
      row.issueTitle === null
        ? null
        : {
            id: row.issueId,
            number: row.issueNumber,
            title: row.issueTitle,
            status: row.issueStatus,
          },
    createdAt: row.createdAt.toISOString(),
  }));
}
