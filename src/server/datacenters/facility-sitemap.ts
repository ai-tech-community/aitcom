import { datacenterFacilityPath } from "@/lib/investigations/datacenter-facilities";
import { isReservedDatacenterSlug } from "@/lib/investigations/datacenter-investigation-routes";
import { db } from "@/server/db";
import { datacenters } from "@/server/db/schema";

export async function listDatacenterFacilitySitemapEntries(): Promise<
  { path: string; updatedAt: Date }[]
> {
  const rows = await db
    .select({ slug: datacenters.slug, updatedAt: datacenters.updatedAt })
    .from(datacenters);
  const entries: { path: string; updatedAt: Date }[] = [];
  for (const row of rows) {
    if (!row.slug || isReservedDatacenterSlug(row.slug)) continue;
    const updatedAt =
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) continue;
    entries.push({
      path: datacenterFacilityPath(row.slug),
      updatedAt,
    });
  }
  return entries;
}
