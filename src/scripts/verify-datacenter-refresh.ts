/**
 * Read-only verification of the datacenter refresh.
 *
 * Confirms row counts, that the merged duplicate slugs are gone, that the
 * survivors are present, and that no child record is orphaned. Writes nothing.
 *
 *   pnpm dlx tsx --env-file=.env src/scripts/verify-datacenter-refresh.ts
 */

import { db } from "@/server/db";
import {
  datacenters,
  brands,
  permits,
  subsidies,
  ownershipEdges,
  datacenterSuppliers,
} from "@/server/db/schema";
import { sql, inArray, isNull, eq } from "drizzle-orm";

const MERGED_AWAY = [
  "meta-temple-tx",
  "nebius-kansas-city-mo",
  "cerebras-condor-galaxy-1-santa-clara",
  "aligned-slc-01-salt-lake-city",
  "stargate-uae-abu-dhabi",
  "humain-riyadh-sa",
];

const SURVIVORS = [
  "meta-temple",
  "nebius-kansas-city",
  "cerebras-santa-clara-condor",
  "aligned-salt-lake-city",
  "g42-stargate-uae-abu-dhabi",
  "humain-saudi-riyadh",
];

type Countable = Parameters<ReturnType<typeof db.select>["from"]>[0];

const count = async (table: Countable) => {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return r[0]?.n ?? 0;
};

async function main() {
  console.log("\n=== ROW COUNTS ===");
  console.log(`  datacenters        ${await count(datacenters)}`);
  console.log(`  brands             ${await count(brands)}`);
  console.log(`  permits            ${await count(permits)}`);
  console.log(`  subsidies          ${await count(subsidies)}`);
  console.log(`  ownershipEdges     ${await count(ownershipEdges)}`);
  console.log(`  datacenterSuppliers ${await count(datacenterSuppliers)}`);

  console.log("\n=== MERGED-AWAY SLUGS (should all be gone) ===");
  const stillThere = await db
    .select({ slug: datacenters.slug })
    .from(datacenters)
    .where(inArray(datacenters.slug, MERGED_AWAY));
  console.log(
    stillThere.length
      ? `  ✗ STILL PRESENT: ${stillThere.map((r) => r.slug).join(", ")}`
      : `  ✓ all ${MERGED_AWAY.length} removed`,
  );

  console.log("\n=== SURVIVORS (should all exist, exactly once) ===");
  const survivors = await db
    .select({ slug: datacenters.slug, status: datacenters.status })
    .from(datacenters)
    .where(inArray(datacenters.slug, SURVIVORS));
  for (const s of SURVIVORS) {
    const hits = survivors.filter((r) => r.slug === s);
    console.log(
      hits.length === 1
        ? `  ✓ ${s.padEnd(30)} ${hits[0]!.status}`
        : `  ✗ ${s.padEnd(30)} found ${hits.length} rows`,
    );
  }

  console.log("\n=== DUPLICATE DETECTION (same operator + coordinates) ===");
  // The neon-http driver returns rows directly; node-postgres wraps them in
  // { rows }. Handle both so this runs against either driver.
  const dupes: unknown = await db.execute(sql`
    SELECT operator_id, lat, lng, count(*)::int AS n,
           string_agg(slug, ' | ' ORDER BY slug) AS slugs
    FROM app.datacenter
    GROUP BY operator_id, lat, lng
    HAVING count(*) > 1
    ORDER BY n DESC
  `);
  const rows: Array<{ slugs: string; n: number }> = Array.isArray(dupes)
    ? (dupes as Array<{ slugs: string; n: number }>)
    : ((dupes as { rows?: Array<{ slugs: string; n: number }> }).rows ?? []);
  if (!rows.length) {
    console.log("  ✓ none");
  } else {
    for (const r of rows) {
      console.log(`  ! ${r.n}x  ${r.slugs}`);
    }
  }

  console.log("\n=== ORPHANED CHILD RECORDS ===");
  for (const [label, table] of [
    ["permits", permits],
    ["subsidies", subsidies],
    ["suppliers", datacenterSuppliers],
  ] as const) {
    const orphans = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .leftJoin(datacenters, eq(table.datacenterId, datacenters.id))
      .where(isNull(datacenters.id));
    console.log(`  ${label.padEnd(12)} ${orphans[0]?.n ?? 0}`);
  }

  console.log("\n=== SPOT CHECK: corrected rows ===");
  const spot = await db
    .select({
      slug: datacenters.slug,
      status: datacenters.status,
      ai: datacenters.aiDedicated,
      mw: datacenters.capacityMw,
      planned: datacenters.capacityMwPlanned,
      capex: datacenters.capexUsd,
    })
    .from(datacenters)
    .where(
      inArray(datacenters.slug, [
        "meta-temple",
        "microsoft-mt-pleasant",
        "meta-hyperion-richland",
        "apple-maiden-nc",
      ]),
    );
  for (const r of spot) {
    console.log(
      `  ${r.slug.padEnd(24)} ${String(r.status).padEnd(18)} ai=${r.ai} mw=${r.mw ?? "-"} planned=${r.planned ?? "-"} capex=${r.capex ?? "-"}`,
    );
  }

  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
