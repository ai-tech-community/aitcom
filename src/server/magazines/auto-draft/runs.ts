import { desc, eq, sql } from "drizzle-orm";

import type { MagazineIssue } from "@/payload-types";
import { magazineAutoDraftRuns } from "@/server/db/schema";

import type { Deps } from "../deps";

/** Any run can hold an open issue, including a crashed or failed attempt. */
export async function findOpenAutoDraft(
  deps: Deps,
  magazineId: number,
): Promise<MagazineIssue | null> {
  const [run] = await deps.db
    .select({ issueId: magazineAutoDraftRuns.issueId })
    .from(magazineAutoDraftRuns)
    .innerJoin(
      sql`"public"."magazine_issues" AS "issue"`,
      sql`"issue"."id" = ${magazineAutoDraftRuns.issueId}
        AND "issue"."status" IN ('draft', 'scheduled')`,
    )
    .where(eq(magazineAutoDraftRuns.magazineId, magazineId))
    .orderBy(
      desc(magazineAutoDraftRuns.claimedAt),
      desc(magazineAutoDraftRuns.id),
    )
    .limit(1);
  if (run?.issueId == null) return null;
  return deps.payload.findByID({
    collection: "magazine-issues",
    id: run.issueId,
    depth: 0,
    disableErrors: true,
  });
}
