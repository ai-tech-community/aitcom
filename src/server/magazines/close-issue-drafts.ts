import { and, eq, inArray, sql } from "drizzle-orm";

import type { db } from "@/server/db";
import { agentDrafts } from "@/server/db/schema";

import { isStalePublishedIssueDraft } from "./article-review-lock";

const MAGAZINE_ISSUE_DRAFT_TYPE = "magazine_issue";

type Database = typeof db;

export type StaleIssueDraft = {
  id: string;
  issueId: number;
  title: string;
};

/**
 * Pending magazine-issue reviews whose issue is already published.
 * Publishing from the issue button used to leave the agent_draft row pending.
 */
function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }
  return [];
}

export async function listStalePublishedIssueDrafts(
  database: Database,
): Promise<StaleIssueDraft[]> {
  const result = await database.execute(sql`
    SELECT d.id,
           i.id AS issue_id,
           d.content AS title,
           d.status AS draft_status,
           i.status AS issue_status
    FROM app.agent_draft d
    JOIN magazine_issues i ON i.id::text = d.target_id
    WHERE d.type = ${MAGAZINE_ISSUE_DRAFT_TYPE}
      AND d.status = 'pending'
      AND i.status = 'published'
    ORDER BY d.created_at, d.id
  `);
  return asRows(result).flatMap((row) => {
    const id = typeof row.id === "string" ? row.id : null;
    const issueId = Number(row.issue_id);
    const draftStatus =
      typeof row.draft_status === "string" ? row.draft_status : "";
    const issueStatus =
      typeof row.issue_status === "string" ? row.issue_status : null;
    if (
      !id ||
      !Number.isInteger(issueId) ||
      !isStalePublishedIssueDraft({
        type: MAGAZINE_ISSUE_DRAFT_TYPE,
        draftStatus,
        issueStatus,
      })
    ) {
      return [];
    }
    return [
      {
        id,
        issueId,
        title: typeof row.title === "string" ? row.title : "",
      },
    ];
  });
}

/** Mark pending reviews of one published issue as published. */
export async function closePendingIssueDrafts(
  database: Database,
  issueId: number,
): Promise<void> {
  await database
    .update(agentDrafts)
    .set({ status: "published" })
    .where(
      and(
        eq(agentDrafts.type, MAGAZINE_ISSUE_DRAFT_TYPE),
        eq(agentDrafts.targetId, String(issueId)),
        eq(agentDrafts.status, "pending"),
      ),
    );
}

export async function closeStalePublishedIssueDrafts(
  database: Database,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await database
    .update(agentDrafts)
    .set({ status: "published" })
    .where(
      and(
        eq(agentDrafts.type, MAGAZINE_ISSUE_DRAFT_TYPE),
        eq(agentDrafts.status, "pending"),
        inArray(agentDrafts.id, [...ids]),
      ),
    )
    .returning({ id: agentDrafts.id });
  return updated.length;
}
