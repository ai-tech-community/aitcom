import { eq } from "drizzle-orm";

import type { NewsDirectoryCompany } from "@/lib/news/companies";
import { db } from "@/server/db";
import { startups } from "@/server/db/schema";

/**
 * Approved directory startups used to name companies on a news row.
 * Matched at read time so a new startup is picked up without a stored column.
 */
export async function listNewsDirectoryCompanies(): Promise<
  NewsDirectoryCompany[]
> {
  return db
    .select({
      slug: startups.slug,
      name: startups.name,
      homepage: startups.homepage,
      logoUrl: startups.logoUrl,
    })
    .from(startups)
    .where(eq(startups.status, "approved"));
}
