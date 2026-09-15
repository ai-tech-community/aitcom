import { desc, eq } from "drizzle-orm";

import {
  displayStartupFounders,
  displayStartupSources,
  parseStartupExitOn,
  parseStartupExitStatus,
  presentText,
  normalizeStartupHomepage,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { db } from "@/server/db";
import { startups } from "@/server/db/schema";

function toPublicCard(row: typeof startups.$inferSelect): StartupPublicCard {
  return {
    id: row.id,
    name: row.name,
    homepage: row.homepage,
    category: row.category,
    sources: displayStartupSources(row.sources ?? []),
    region: presentText(row.region),
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    stage: presentText(row.stage),
    logoUrl: presentText(row.logoUrl),
    founders: displayStartupFounders(row.founders),
    exitStatus: parseStartupExitStatus(row.exitStatus),
    acquirer: presentText(row.acquirer),
    exitOn: parseStartupExitOn(row.exitOn),
    jobsUrl: row.jobsUrl ? normalizeStartupHomepage(row.jobsUrl) : null,
    listedOn: row.listedOn,
  };
}

/** Public directory. DB only — empty table or query failure is a soft empty. */
export async function listApprovedPublicStartups(): Promise<
  StartupPublicCard[]
> {
  try {
    const rows = await db
      .select()
      .from(startups)
      .where(eq(startups.status, "approved"))
      .orderBy(desc(startups.listedOn), desc(startups.createdAt));
    return rows.map(toPublicCard);
  } catch {
    return [];
  }
}

export async function findStartupByHomepage(homepage: string) {
  const [row] = await db
    .select()
    .from(startups)
    .where(eq(startups.homepage, homepage))
    .limit(1);
  return row ?? null;
}

export async function findStartupById(id: string) {
  const [row] = await db
    .select()
    .from(startups)
    .where(eq(startups.id, id))
    .limit(1);
  return row ?? null;
}
