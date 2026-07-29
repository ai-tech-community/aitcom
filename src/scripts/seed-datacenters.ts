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
import {
  REFRESH_2026_07_DATACENTERS,
  REFRESH_2026_07_BRANDS,
} from "./seed-data/refresh-2026-07";

// Canonical core brands (always present). Other brands come from regional files.
const CORE_BRANDS: SeedBrand[] = [
  {
    slug: "aws",
    canonicalName: "Amazon Web Services",
    website: "https://aws.amazon.com",
  },
  {
    slug: "microsoft",
    canonicalName: "Microsoft",
    website: "https://microsoft.com",
  },
  { slug: "google", canonicalName: "Google", website: "https://google.com" },
  { slug: "meta", canonicalName: "Meta", website: "https://meta.com" },
  { slug: "oracle", canonicalName: "Oracle", website: "https://oracle.com" },
  { slug: "openai", canonicalName: "OpenAI", website: "https://openai.com" },
  { slug: "xai", canonicalName: "xAI", website: "https://x.ai" },
  {
    slug: "coreweave",
    canonicalName: "CoreWeave",
    website: "https://coreweave.com",
  },
  { slug: "crusoe", canonicalName: "Crusoe", website: "https://crusoe.ai" },
  { slug: "equinix", canonicalName: "Equinix", website: "https://equinix.com" },
  {
    slug: "digital-realty",
    canonicalName: "Digital Realty",
    website: "https://digitalrealty.com",
  },
  { slug: "tva", canonicalName: "Tennessee Valley Authority" },
  { slug: "ercot", canonicalName: "ERCOT" },
];

// Operator slug normalization (in case agents emitted variants)
const SLUG_NORMALIZE: Record<string, string> = {
  "amazon-web-services": "aws",
  "microsoft-azure": "microsoft",
  "google-cloud": "google",
  "oracle-cloud": "oracle",
  "ntt-gdc": "ntt",
};

function normalize(slug: string): string {
  return SLUG_NORMALIZE[slug] ?? slug;
}

// Original showcase entries (kept here, not duplicated in regional files)
const SHOWCASE: SeedDatacenter[] = [
  {
    slug: "stargate-abilene",
    name: "Stargate — Abilene Campus",
    operatorSlug: "openai",
    status: "under-construction",
    aiDedicated: true,
    lat: 32.4487,
    lng: -99.7331,
    city: "Abilene",
    region: "TX",
    country: "US",
    capacityMwPlanned: 1200,
    primaryPowerSource: "gas",
    utilitySlug: "ercot",
    coolingType: "direct-to-chip",
    description:
      "First Stargate site under the OpenAI / Oracle / SoftBank joint venture, targeting up to 1.2 GW for AI training workloads.",
    sources: [
      {
        url: "https://openai.com/index/announcing-the-stargate-project/",
        type: "operator",
      },
    ],
  },
  {
    slug: "xai-colossus-memphis",
    name: "Colossus — Memphis",
    operatorSlug: "xai",
    status: "operational",
    aiDedicated: true,
    lat: 35.0726,
    lng: -90.0186,
    city: "Memphis",
    region: "TN",
    country: "US",
    capacityMw: 250,
    capacityMwPlanned: 1000,
    primaryPowerSource: "gas",
    utilitySlug: "tva",
    coolingType: "direct-to-chip",
    description:
      "xAI's primary training cluster, originally 100k H100s, expanding toward 1M GPUs. Powered partly by on-site gas turbines.",
    sources: [{ url: "https://x.ai/blog/colossus", type: "operator" }],
  },
  {
    slug: "meta-hyperion-richland",
    name: "Hyperion — Richland Parish",
    operatorSlug: "meta",
    status: "under-construction",
    aiDedicated: true,
    lat: 32.4393,
    lng: -91.7626,
    city: "Richland Parish",
    region: "LA",
    country: "US",
    capacityMwPlanned: 2000,
    primaryPowerSource: "gas",
    coolingType: "direct-to-chip",
    description:
      "Meta's largest planned AI campus, ~2 GW IT load at full build-out. Supplied by new gas plants from Entergy.",
    sources: [
      {
        url: "https://about.fb.com/news/2024/12/meta-louisiana-ai-data-center/",
        type: "pr",
      },
    ],
  },
  {
    slug: "microsoft-mt-pleasant",
    name: "Microsoft Mt. Pleasant Campus",
    operatorSlug: "microsoft",
    status: "under-construction",
    aiDedicated: true,
    lat: 42.7144,
    lng: -87.9337,
    city: "Mount Pleasant",
    region: "WI",
    country: "US",
    capacityMwPlanned: 900,
    primaryPowerSource: "grid-mixed",
    description: "Microsoft's Wisconsin AI campus on the former Foxconn site.",
    sources: [
      {
        url: "https://blogs.microsoft.com/on-the-issues/2024/05/08/wisconsin-data-center-investment-ai/",
        type: "pr",
      },
    ],
  },
  {
    slug: "aws-northern-virginia-pjm",
    name: "AWS Northern Virginia Cluster",
    operatorSlug: "aws",
    status: "operational",
    aiDedicated: false,
    lat: 39.0438,
    lng: -77.4874,
    city: "Ashburn",
    region: "VA",
    country: "US",
    capacityMw: 3000,
    primaryPowerSource: "grid-mixed",
    description:
      "Loudoun County / 'Data Center Alley' — the world's densest concentration of cloud capacity.",
    sources: [
      { url: "https://www.loudoun.gov/4922/Data-Centers", type: "other" },
    ],
  },
  {
    slug: "google-the-dalles",
    name: "Google The Dalles",
    operatorSlug: "google",
    status: "operational",
    aiDedicated: false,
    lat: 45.6,
    lng: -121.18,
    city: "The Dalles",
    region: "OR",
    country: "US",
    capacityMw: 350,
    primaryPowerSource: "hydro",
    coolingType: "open-loop",
    description:
      "Google's flagship Pacific Northwest campus, hydropower-fed, water-cooled from the Columbia River.",
    sources: [
      {
        url: "https://www.google.com/about/datacenters/locations/the-dalles/",
        type: "operator",
      },
    ],
  },
  {
    slug: "oracle-stargate-abilene-2",
    name: "Oracle Abilene Phase 2",
    operatorSlug: "oracle",
    status: "announced",
    aiDedicated: true,
    lat: 32.45,
    lng: -99.74,
    city: "Abilene",
    region: "TX",
    country: "US",
    capacityMwPlanned: 800,
    primaryPowerSource: "gas",
    coolingType: "direct-to-chip",
    description: "Oracle's Phase 2 expansion of the Stargate Abilene campus.",
    sources: [{ url: "https://www.oracle.com/news/announcement/", type: "pr" }],
  },
  {
    slug: "coreweave-plano",
    name: "CoreWeave Plano",
    operatorSlug: "coreweave",
    status: "operational",
    aiDedicated: true,
    lat: 33.0198,
    lng: -96.6989,
    city: "Plano",
    region: "TX",
    country: "US",
    capacityMw: 200,
    primaryPowerSource: "grid-mixed",
    coolingType: "direct-to-chip",
    description: "CoreWeave's Texas GPU cluster, leased to large AI labs.",
    sources: [
      { url: "https://www.coreweave.com/data-centers", type: "operator" },
    ],
  },
];

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
