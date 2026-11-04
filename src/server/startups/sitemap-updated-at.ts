import { and, eq } from "drizzle-orm";

import {
  buildStartupProfilePath,
  buildStartupRolePath,
  parseStartupSlug,
} from "@/lib/investigations/startups";
import { db } from "@/server/db";
import { startupRoles, startups } from "@/server/db/schema";

/** A row timestamp, or nothing when the column is missing or unparseable. */
export function sitemapRowUpdatedAt(
  value: string | Date | null | undefined,
): Date | undefined {
  if (value == null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Path → `updated_at` for approved startups and open roles. The sitemap
 * stamps only paths it already lists, so a date here never adds a URL.
 */
export async function listSitemapContentUpdatedAt(): Promise<
  ReadonlyMap<string, Date>
> {
  const map = new Map<string, Date>();
  try {
    const startupRows = await db
      .select({
        slug: startups.slug,
        updatedAt: startups.updatedAt,
      })
      .from(startups)
      .where(eq(startups.status, "approved"));
    for (const row of startupRows) {
      const slug = parseStartupSlug(row.slug);
      const updatedAt = sitemapRowUpdatedAt(row.updatedAt);
      if (!slug || !updatedAt) continue;
      map.set(buildStartupProfilePath(slug), updatedAt);
    }
  } catch (error) {
    console.error("[sitemap] startup lastmod lookup failed", error);
  }

  try {
    const roleRows = await db
      .select({
        slug: startupRoles.slug,
        updatedAt: startupRoles.updatedAt,
      })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(
        and(eq(startups.status, "approved"), eq(startupRoles.status, "open")),
      );
    for (const row of roleRows) {
      const slug = parseStartupSlug(row.slug);
      const updatedAt = sitemapRowUpdatedAt(row.updatedAt);
      if (!slug || !updatedAt) continue;
      map.set(buildStartupRolePath(slug), updatedAt);
    }
  } catch (error) {
    console.error("[sitemap] role lastmod lookup failed", error);
  }

  return map;
}
