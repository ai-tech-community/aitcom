/**
 * Seed script for datacenter research starter data.
 *
 * Aggregates ~200 real AI/cloud datacenter facilities from regional research files:
 *   - seed-data/na.ts            North America
 *   - seed-data/eu.ts            Europe
 *   - seed-data/apac.ts          APAC + Middle East + Africa + LATAM
 *   - seed-data/ai-native.ts     AI-native operators + colos + 2024-2026 mega-campuses
 *
 * Idempotent — uses onConflictDoNothing for brands and skips datacenters whose
 * slug already exists. All seeded entries are marked verified=true so they
 * appear in the default map view.
 *
 * Usage:
 *   pnpm datacenters:seed
 *
 * NOTE: Capacity / water / power figures are approximate, drawn from public
 * announcements and press coverage. Treat as starter data — community is
 * expected to refine sources and figures.
 */

import { db } from "@/server/db";
import { brands, datacenters, type DatacenterSource } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { SeedDatacenter, SeedBrand } from "./seed-data/types";
import { NORTH_AMERICA, NA_BRANDS } from "./seed-data/na";
import { EUROPE, EU_BRANDS } from "./seed-data/eu";
import { APAC_ME_AF_LATAM, APAC_BRANDS } from "./seed-data/apac";
import { AI_NATIVE, AI_NATIVE_BRANDS } from "./seed-data/ai-native";
import { CORE_BRANDS, SHOWCASE, normalize } from "./seed-data/showcase";
import {
  REFRESH_2026_07_DATACENTERS,
  REFRESH_2026_07_BRANDS,
} from "./seed-data/refresh-2026-07";

function dedupeBrands(...lists: SeedBrand[][]): SeedBrand[] {
  const seen = new Map<string, SeedBrand>();
  for (const list of lists) {
    for (const b of list) {
      const slug = normalize(b.slug);
      if (!seen.has(slug)) {
        seen.set(slug, { ...b, slug });
      }
    }
  }
  return [...seen.values()];
}

function dedupeDatacenters(...lists: SeedDatacenter[][]): SeedDatacenter[] {
  const seen = new Map<string, SeedDatacenter>();
  for (const list of lists) {
    for (const d of list) {
      if (!seen.has(d.slug)) {
        seen.set(d.slug, {
          ...d,
          operatorSlug: normalize(d.operatorSlug),
          utilitySlug: d.utilitySlug ? normalize(d.utilitySlug) : undefined,
        });
      }
    }
  }
  return [...seen.values()];
}

const ALL_BRANDS = dedupeBrands(
  CORE_BRANDS,
  NA_BRANDS,
  EU_BRANDS,
  APAC_BRANDS,
  AI_NATIVE_BRANDS,
  REFRESH_2026_07_BRANDS,
);

// The refresh batch goes last so that if it ever restates a site already held in
// a regional file, the established record wins and the refresh is ignored rather
// than silently overwriting curated data. New slugs are unaffected.
const ALL_DATACENTERS = dedupeDatacenters(
  SHOWCASE,
  NORTH_AMERICA,
  EUROPE,
  APAC_ME_AF_LATAM,
  AI_NATIVE,
  REFRESH_2026_07_DATACENTERS,
);

async function main() {
  console.log(`Seeding ${ALL_BRANDS.length} brands...`);
  for (const b of ALL_BRANDS) {
    await db
      .insert(brands)
      .values({
        slug: b.slug,
        canonicalName: b.canonicalName,
        website: b.website,
        verified: true,
      })
      .onConflictDoNothing();
  }

  const brandRows = await db.select().from(brands);
  const brandMap = new Map(brandRows.map((b) => [b.slug, b.id]));
  const missingOperators = new Set<string>();

  console.log(`Seeding ${ALL_DATACENTERS.length} datacenters...`);
  let inserted = 0;
  let skipped = 0;
  for (const d of ALL_DATACENTERS) {
    const operatorId = brandMap.get(d.operatorSlug);
    if (!operatorId) {
      missingOperators.add(d.operatorSlug);
      console.warn(
        `  skipping ${d.slug} — operator brand "${d.operatorSlug}" missing`,
      );
      skipped++;
      continue;
    }
    const utilityId = d.utilitySlug ? brandMap.get(d.utilitySlug) : undefined;

    const existing = await db
      .select({ id: datacenters.id })
      .from(datacenters)
      .where(eq(datacenters.slug, d.slug))
      .limit(1);
    if (existing.length) {
      skipped++;
      continue;
    }

    await db.insert(datacenters).values({
      slug: d.slug,
      name: d.name,
      operatorId,
      status: d.status,
      aiDedicated: d.aiDedicated,
      lat: d.lat,
      lng: d.lng,
      city: d.city,
      region: d.region,
      country: d.country,
      capacityMw: d.capacityMw,
      capacityMwPlanned: d.capacityMwPlanned,
      primaryPowerSource: d.primaryPowerSource,
      utilityId,
      coolingType: d.coolingType,
      description: d.description,
      sources: d.sources satisfies DatacenterSource[],
      verified: true,
    });
    inserted++;
  }

  console.log(`Inserted: ${inserted}, skipped: ${skipped}`);
  if (missingOperators.size) {
    console.warn(
      `Missing operator slugs (add to a regional brands list):`,
      [...missingOperators].sort(),
    );
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
