import { eq } from "drizzle-orm";

import {
  parseSuggestionReason,
  type SuggestionReason,
} from "@/lib/magazines/suggestions";
import { magazineAutoPicks } from "@/server/db/schema";
import type { Deps } from "../deps";
import { isAutoMadeIssue } from "./runs";

export async function saveAutoPicks(
  db: Deps["db"],
  issueId: number,
  picks: { itemId: string; reason: SuggestionReason }[],
): Promise<void> {
  if (picks.length === 0) return;
  await db
    .insert(magazineAutoPicks)
    .values(picks.map((pick) => ({ issueId, ...pick })));
}

/** Editor-only metadata; malformed or no-longer-known reasons are ignored. */
export async function loadAutoDraftForIssue(
  db: Deps["db"],
  issueId: number,
): Promise<{ reasons: Record<string, SuggestionReason> } | null> {
  if (!(await isAutoMadeIssue(db, issueId))) return null;
  const rows = await db
    .select()
    .from(magazineAutoPicks)
    .where(eq(magazineAutoPicks.issueId, issueId));
  const reasons: Record<string, SuggestionReason> = {};
  for (const row of rows) {
    const reason = parseSuggestionReason(row.reason);
    if (reason) reasons[row.itemId] = reason;
  }
  return { reasons };
}
