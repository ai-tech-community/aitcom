import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";

import type { NewsDirectoryCompany } from "@/lib/news/companies";
import { db } from "@/server/db";
import { startups } from "@/server/db/schema";

import { NEWS_TABLE_CACHE_TAG } from "./cache";

async function listNewsDirectoryCompaniesUncached(): Promise<
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

/**
 * Approved directory startups used to name companies on a news row.
 * Matched at read time so a new startup is picked up without a stored column.
 * Cached for a minute; rumor and feed writes drop the tag.
 */
export const listNewsDirectoryCompanies = unstable_cache(
  listNewsDirectoryCompaniesUncached,
  ["news-directory-companies"],
  { revalidate: 60, tags: [NEWS_TABLE_CACHE_TAG] },
);
