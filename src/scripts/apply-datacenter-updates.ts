/**
 * Applies corrections to datacenter rows that already exist.
 *
 * `seed-datacenters.ts` is insert-only: it skips any slug already present. That
 * is right for re-running a seed, but it means a site that changed after it was
 * first seeded — went operational, doubled in size, got cancelled — can never be
 * corrected. This script is the missing half.
 *
 * It does two things:
 *   1. UPDATES — set changed fields on an existing row, each change carrying the
 *      source that justifies it.
 *   2. MERGES — collapse two rows that describe the same physical site, moving
 *      every child record (permits, subsidies, suppliers, findings, status
 *      history, energy deals) onto the surviving row before deleting the loser.
 *
 * Both are idempotent: an update that is already applied is reported as a no-op,
 * and a merge whose loser is already gone does nothing.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 *   pnpm dlx tsx --env-file=.env src/scripts/apply-datacenter-updates.ts
 *   pnpm dlx tsx --env-file=.env src/scripts/apply-datacenter-updates.ts --apply
 *
 * NOTE: DATABASE_URL in .env points at production. Run the dry run first, read
 * the diff, and only pass --apply when the diff is what you intend.
 */

import { db } from "@/server/db";
import {
  datacenters,
  datacenterSuppliers,
  datacenterFindings,
  datacenterStatusHistory,
  energyDeals,
  permits,
  subsidies,
  type DatacenterSource,
} from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

type FieldUpdate = {
  slug: string;
  /** Why this row is being changed, in one line — shown in the dry run. */
  reason: string;
  set: Partial<{
    status: string;
    aiDedicated: boolean;
    capacityMw: number;
    capacityMwPlanned: number;
    coolingType: string;
    description: string;
    onlineDate: string;
    capexUsd: number;
  }>;
  /** Appended to the row's existing sources; duplicates by URL are skipped. */
  addSources: DatacenterSource[];
};

type Merge = {
  keep: string;
  remove: string;
  reason: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Updates found in the 2026-04-28 → 2026-07-29 research refresh.
// ─────────────────────────────────────────────────────────────────────────────

const UPDATES: FieldUpdate[] = [
  {
    slug: "microsoft-mt-pleasant",
    reason:
      "Microsoft announced 2026-06-23 that the first Mount Pleasant facility is complete and was brought online in April 2026. Row still said under-construction.",
    set: {
      status: "operational",
      description:
        "Microsoft's Mount Pleasant, Wisconsin campus. The first facility (Fairwater) completed construction and came online in April 2026; a second adjacent facility remains under construction with completion expected in 2028.",
    },
    addSources: [
      {
        url: "https://news.microsoft.com/source/2026/06/23/microsoft-completes-construction-on-first-datacenter-facility-in-mount-pleasant-wisconsin/",
        title:
          "Microsoft completes construction on first datacenter facility in Mount Pleasant, Wisconsin",
        type: "operator",
        publishedAt: "2026-06-23",
      },
    ],
  },
  {
    slug: "meta-hyperion-richland",
    reason:
      "Meta said 2026-07-13 it is expanding Richland Parish to 5 GW. Row predates the expansion.",
    set: {
      status: "expanding",
      capacityMwPlanned: 5000,
      description:
        "Meta's Richland Parish, Louisiana campus, home to the Hyperion training cluster, expanding to 5 GW of compute and lifting stated regional investment above $50bn. Power is supplied via Entergy Louisiana, whose plan includes new gas-fired generation, grid-scale batteries and nuclear uprates.",
    },
    addSources: [
      {
        url: "https://datacenters.atmeta.com/2026/07/deepening-our-investment-in-richland-parish-louisiana/",
        title: "Deepening our investment in Richland Parish, Louisiana",
        type: "operator",
        publishedAt: "2026-07-13",
      },
    ],
  },
  {
    slug: "meta-temple",
    reason:
      "Site went live 2026-07-22 as Meta's first AI-optimised US datacenter. The surviving row said under-construction, aiDedicated=false, and carried an unsourced 240MW planned figure. Meta's own one-pager states $1.2bn and confirms the site is operational but publishes no megawatt figure; the ~198MW below comes from local reporting and is flagged as such.",
    set: {
      status: "operational",
      aiDedicated: true,
      capacityMw: 198,
      capexUsd: 1_200_000_000,
      coolingType: "closed-loop",
      description:
        "Meta's Temple, Texas campus — two buildings, 760,000+ sq ft — which went live in July 2026 as the first facility to open with Meta's AI-optimised datacenter design. Meta states $1.2bn invested and ~100 operations roles but publishes no capacity figure; the ~198MW here is from local reporting, not from Meta. Electricity is supplied by Oncor and matched 100% with renewables.",
    },
    addSources: [
      {
        url: "https://datacenters.atmeta.com/asset/temple-data-center-one-pager/",
        title: "Meta Temple Data Center (one-pager)",
        type: "operator",
      },
      {
        url: "https://www.kwtx.com/2026/07/22/meta-goes-live-temple-with-12-billion-ai-data-center/",
        title: "Meta goes live in Temple with $1.2 billion AI data center",
        type: "news",
        publishedAt: "2026-07-22",
      },
    ],
  },
];

// Each pair below is one physical site that was seeded twice under two different
// slugs. Because the slugs differ, `dedupeDatacenters()` saw two sites and
// inserted both, so both rows are live and must be merged here — unlike the 13
// same-slug duplicates, which dedupe collapsed and which needed only a seed-file
// cleanup.
//
// In every case the surviving slug is the one that remains in na.ts / apac.ts,
// which is also the row that existing child records and any user-generated
// findings already point at.
const MERGES: Merge[] = [
  {
    keep: "meta-temple",
    remove: "meta-temple-tx",
    reason:
      "Same site: identical coordinates (31.0982, -97.3428), same city, same operator. Seeded twice — once from na.ts and once from ai-native.ts — with conflicting capacity (240MW vs 700MW), cooling and aiDedicated values. Neither figure was sourced; Meta publishes no megawatt number for Temple. Keeping the na.ts slug because it carries the correct Oncor utility link.",
  },
  {
    keep: "nebius-kansas-city",
    remove: "nebius-kansas-city-mo",
    reason:
      "Same Nebius Kansas City campus at identical coordinates (39.0997, -94.5786). The two records disagreed on status (operational vs under-construction) and capacity (40MW vs 300MW planned); neither is sourced well enough to overwrite the other, so the surviving row keeps its own values and the conflict is recorded in the research note.",
  },
  {
    keep: "cerebras-santa-clara-condor",
    remove: "cerebras-condor-galaxy-1-santa-clara",
    reason:
      "Both describe the Cerebras/G42 Condor Galaxy 1 supercomputer hosted in Colovore Santa Clara, at identical coordinates (37.3541, -121.9552).",
  },
  {
    keep: "aligned-salt-lake-city",
    remove: "aligned-slc-01-salt-lake-city",
    reason:
      "Both are Aligned SLC-01 in the Salt Lake City area at identical coordinates (40.7608, -111.8910); the names even agree. The records disagreed on aiDedicated (false vs true) and capacity (unset vs 36MW).",
  },
  {
    keep: "g42-stargate-uae-abu-dhabi",
    remove: "stargate-uae-abu-dhabi",
    reason:
      "Both are the 1 GW Stargate UAE first phase by G42/Khazna with OpenAI, at identical coordinates (24.4539, 54.3773). Same planned capacity, differing only on status.",
  },
  {
    keep: "humain-saudi-riyadh",
    remove: "humain-riyadh-sa",
    reason:
      "Both are the HUMAIN (Saudi PIF) Riyadh AI campus at identical coordinates (24.7136, 46.6753), same 1,900MW planned capacity, differing only on status.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const CHILD_TABLES = [
  { name: "permits", table: permits },
  { name: "subsidies", table: subsidies },
  { name: "datacenterSuppliers", table: datacenterSuppliers },
  { name: "datacenterFindings", table: datacenterFindings },
  { name: "datacenterStatusHistory", table: datacenterStatusHistory },
  { name: "energyDeals", table: energyDeals },
] as const;

function mergeSources(
  existing: DatacenterSource[] | null,
  incoming: DatacenterSource[],
): { merged: DatacenterSource[]; added: number } {
  const current = existing ?? [];
  const seen = new Set(current.map((s) => s.url));
  const added = incoming.filter((s) => !seen.has(s.url));
  return { merged: [...current, ...added], added: added.length };
}

async function runUpdates() {
  console.log(
    `\n${"═".repeat(72)}\nFIELD UPDATES (${UPDATES.length})\n${"═".repeat(72)}`,
  );

  for (const u of UPDATES) {
    const [row] = await db
      .select()
      .from(datacenters)
      .where(eq(datacenters.slug, u.slug))
      .limit(1);

    if (!row) {
      console.log(`\n✗ ${u.slug} — NOT FOUND, skipping`);
      continue;
    }

    const changes: string[] = [];
    for (const [k, v] of Object.entries(u.set)) {
      const before = (row as Record<string, unknown>)[k];
      const same = typeof v === "number" ? Number(before) === v : before === v;
      if (!same) {
        const shown =
          typeof before === "string" && before.length > 60
            ? `${before.slice(0, 57)}...`
            : String(before);
        const to =
          typeof v === "string" && v.length > 60
            ? `${v.slice(0, 57)}...`
            : String(v);
        changes.push(`      ${k}: ${shown}  →  ${to}`);
      }
    }

    const { merged, added } = mergeSources(row.sources, u.addSources);

    console.log(`\n${changes.length || added ? "●" : "○"} ${u.slug}`);
    console.log(`      ${u.reason}`);
    if (!changes.length && !added) {
      console.log(`      already up to date — no change`);
      continue;
    }
    changes.forEach((c) => console.log(c));
    if (added) console.log(`      sources: +${added}`);

    if (APPLY) {
      await db
        .update(datacenters)
        .set({ ...u.set, sources: merged, updatedAt: new Date() })
        .where(eq(datacenters.slug, u.slug));
      console.log(`      APPLIED`);
    }
  }
}

async function runMerges() {
  console.log(
    `\n${"═".repeat(72)}\nMERGES (${MERGES.length})\n${"═".repeat(72)}`,
  );

  for (const m of MERGES) {
    const [keep] = await db
      .select({ id: datacenters.id, slug: datacenters.slug })
      .from(datacenters)
      .where(eq(datacenters.slug, m.keep))
      .limit(1);
    const [remove] = await db
      .select({ id: datacenters.id, slug: datacenters.slug })
      .from(datacenters)
      .where(eq(datacenters.slug, m.remove))
      .limit(1);

    console.log(`\n● ${m.remove}  →  ${m.keep}`);
    console.log(`      ${m.reason}`);

    if (!keep) {
      console.log(`      ✗ survivor "${m.keep}" not found — skipping`);
      continue;
    }
    if (!remove) {
      console.log(`      ○ "${m.remove}" already absent — nothing to do`);
      continue;
    }

    for (const { name, table } of CHILD_TABLES) {
      const counted = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.datacenterId, remove.id));
      const n = counted[0]?.n ?? 0;
      if (n > 0) {
        console.log(`      ${name}: ${n} row(s) to re-point`);
        if (APPLY) {
          await db
            .update(table)
            .set({ datacenterId: keep.id })
            .where(eq(table.datacenterId, remove.id));
        }
      }
    }

    if (APPLY) {
      await db.delete(datacenters).where(eq(datacenters.id, remove.id));
      console.log(`      APPLIED — ${m.remove} deleted`);
    }
  }
}

async function main() {
  console.log(
    APPLY
      ? "\n*** APPLY MODE — changes will be written ***"
      : "\n--- DRY RUN — nothing will be written (pass --apply to commit) ---",
  );

  await runUpdates();
  await runMerges();

  console.log(
    APPLY
      ? `\nDone. Changes written.\n`
      : `\nDry run complete. Re-run with --apply to write these changes.\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
