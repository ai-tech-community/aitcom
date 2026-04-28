/**
 * Seed renewable / carbon-free commitments for top operators.
 *
 * Updates `app.brand` rows with commitmentRenewablePct, commitmentTargetYear,
 * and commitmentSourceUrl. Idempotent: re-running overwrites with the seed
 * values (community can edit / dispute via findings flow later).
 *
 * Usage:
 *   pnpm commitments:seed
 *
 * NOTE: These are public commitments as published by the operators. Treat as
 * starter data — investigative work should compare against actual mix.
 */

import { db } from "@/server/db";
import { brands } from "@/server/db/schema";
import { eq } from "drizzle-orm";

type Commitment = {
  slug: string;
  pct: number;
  year: number;
  url: string;
};

const COMMITMENTS: Commitment[] = [
  {
    slug: "microsoft",
    pct: 100,
    year: 2025,
    url: "https://blogs.microsoft.com/blog/2020/01/16/microsoft-will-be-carbon-negative-by-2030/",
  },
  {
    slug: "google",
    pct: 100,
    year: 2030,
    url: "https://sustainability.google/operating-sustainably/",
  },
  {
    slug: "meta",
    pct: 100,
    year: 2020,
    url: "https://sustainability.atmeta.com/our-actions/net-zero/",
  },
  {
    slug: "aws",
    pct: 100,
    year: 2025,
    url: "https://sustainability.aboutamazon.com/climate-solutions/the-climate-pledge",
  },
  {
    slug: "apple",
    pct: 100,
    year: 2020,
    url: "https://www.apple.com/environment/",
  },
  {
    slug: "oracle",
    pct: 100,
    year: 2025,
    url: "https://www.oracle.com/sustainability/",
  },
  {
    slug: "alibaba-cloud",
    pct: 100,
    year: 2030,
    url: "https://www.alibabagroup.com/document/Alibaba-ESG-Report-FY2024.pdf",
  },
  {
    slug: "digital-realty",
    pct: 100,
    year: 2030,
    url: "https://www.digitalrealty.com/about/sustainability",
  },
  {
    slug: "equinix",
    pct: 100,
    year: 2030,
    url: "https://www.equinix.com/about/sustainability",
  },
  {
    slug: "ovhcloud",
    pct: 100,
    year: 2025,
    url: "https://corporate.ovhcloud.com/en/sustainability/",
  },
  {
    slug: "openai",
    pct: 0,
    year: 0,
    url: "https://openai.com/",
  },
  {
    slug: "xai",
    pct: 0,
    year: 0,
    url: "https://x.ai/",
  },
  {
    slug: "coreweave",
    pct: 0,
    year: 0,
    url: "https://www.coreweave.com/",
  },
];

async function main() {
  let updated = 0;
  let skipped = 0;
  for (const c of COMMITMENTS) {
    const [row] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, c.slug))
      .limit(1);
    if (!row) {
      console.warn(`  no brand: ${c.slug}`);
      skipped++;
      continue;
    }
    await db
      .update(brands)
      .set({
        commitmentRenewablePct: c.pct || null,
        commitmentTargetYear: c.year || null,
        commitmentSourceUrl: c.url || null,
        updatedAt: new Date(),
      })
      .where(eq(brands.slug, c.slug));
    updated++;
    console.log(`  ${c.slug}: ${c.pct}% by ${c.year}`);
  }
  console.log(`Updated ${updated}, skipped ${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
