/**
 * Phase 6 seed: ownership chains, subsidies, permits, capex, status history.
 *
 * Idempotent. Skips dupes by natural-key match. Backfills status_history
 * from existing announce/groundbreak/online dates on datacenter rows.
 *
 * Usage:
 *   pnpm investigations:seed
 */

import { db } from "@/server/db";
import {
  brands,
  datacenters,
  datacenterStatusHistory,
  ownershipEdges,
  permits,
  subsidies,
} from "@/server/db/schema";
import { and, eq, sql } from "drizzle-orm";

import {
  BRAND_UPSERTS,
  NEW_BRANDS,
  OWNERSHIP_EDGES,
} from "./seed-data/ownership";
import { SUBSIDIES } from "./seed-data/subsidies";
import { PERMITS } from "./seed-data/permits";
import { CAPEX_UPDATES } from "./seed-data/capex";

async function main() {
  // ── 1. Insert new parent/holding brands ──
  console.log(`Upserting ${NEW_BRANDS.length} new parent brands...`);
  for (const b of NEW_BRANDS) {
    await db
      .insert(brands)
      .values({
        slug: b.slug,
        canonicalName: b.canonicalName,
        website: b.website,
        jurisdiction: b.jurisdiction,
        jurisdictionRegion: b.jurisdictionRegion,
        entityType: b.entityType,
        verified: false,
      })
      .onConflictDoNothing();
  }

  // ── 2. Update existing brand metadata (jurisdiction, entityType, UBO) ──
  console.log(`Updating ${BRAND_UPSERTS.length} brand metadata records...`);
  let metaUpdated = 0;
  for (const u of BRAND_UPSERTS) {
    const r = await db
      .update(brands)
      .set({
        jurisdiction: u.jurisdiction ?? null,
        jurisdictionRegion: u.jurisdictionRegion ?? null,
        entityType: u.entityType ?? null,
        ultimateBeneficialOwner: u.ultimateBeneficialOwner ?? null,
        updatedAt: new Date(),
      })
      .where(eq(brands.slug, u.slug))
      .returning({ id: brands.id });
    if (r.length) metaUpdated++;
  }
  console.log(`  meta updated: ${metaUpdated}`);

  // ── 3. Build slug→id maps ──
  const allBrands = await db
    .select({ id: brands.id, slug: brands.slug })
    .from(brands);
  const brandMap = new Map(allBrands.map((b) => [b.slug, b.id]));

  const allDcs = await db
    .select({ id: datacenters.id, slug: datacenters.slug })
    .from(datacenters);
  const dcMap = new Map(allDcs.map((d) => [d.slug, d.id]));

  // ── 4. Insert ownership edges ──
  console.log(`Inserting ${OWNERSHIP_EDGES.length} ownership edges...`);
  let edgesInserted = 0;
  let edgesSkipped = 0;
  const missingBrandsForEdges = new Set<string>();
  for (const e of OWNERSHIP_EDGES) {
    const parent = brandMap.get(e.parentSlug);
    const child = brandMap.get(e.childSlug);
    if (!parent || !child) {
      if (!parent) missingBrandsForEdges.add(e.parentSlug);
      if (!child) missingBrandsForEdges.add(e.childSlug);
      edgesSkipped++;
      continue;
    }
    if (parent === child) {
      edgesSkipped++;
      continue;
    }
    const dup = await db
      .select({ id: ownershipEdges.id })
      .from(ownershipEdges)
      .where(
        and(
          eq(ownershipEdges.parentBrandId, parent),
          eq(ownershipEdges.childBrandId, child),
        ),
      )
      .limit(1);
    if (dup.length) {
      edgesSkipped++;
      continue;
    }
    const fullDate = (s: string | undefined): string | null =>
      s && s.length === 10 ? s : null;
    await db.insert(ownershipEdges).values({
      parentBrandId: parent,
      childBrandId: child,
      ownershipPct: e.ownershipPct ?? null,
      effectiveFrom: fullDate(e.effectiveFrom),
      sourceUrl: e.sourceUrl,
      notes: e.notes ?? null,
      verified: true,
    });
    edgesInserted++;
  }
  console.log(`  inserted: ${edgesInserted}, skipped: ${edgesSkipped}`);

  // ── 5. Insert subsidies ──
  console.log(`Inserting ${SUBSIDIES.length} subsidies...`);
  let subsInserted = 0;
  let subsSkipped = 0;
  const missingDcsForSubs = new Set<string>();
  for (const s of SUBSIDIES) {
    const dcId = dcMap.get(s.datacenterSlug);
    if (!dcId) {
      missingDcsForSubs.add(s.datacenterSlug);
      subsSkipped++;
      continue;
    }
    const recipientId = s.recipientBrandSlug
      ? brandMap.get(s.recipientBrandSlug)
      : null;
    const dup = await db
      .select({ id: subsidies.id })
      .from(subsidies)
      .where(
        and(
          eq(subsidies.datacenterId, dcId),
          eq(subsidies.kind, s.kind),
          eq(subsidies.awardedBy, s.awardedBy),
        ),
      )
      .limit(1);
    if (dup.length) {
      subsSkipped++;
      continue;
    }
    await db.insert(subsidies).values({
      datacenterId: dcId,
      recipientBrandId: recipientId ?? null,
      kind: s.kind,
      awardedBy: s.awardedBy,
      jurisdiction: s.jurisdiction,
      amountUsd: s.amountUsd ?? null,
      announcedDate: s.announcedDate ?? null,
      effectiveDate: s.effectiveDate ?? null,
      termYears: s.termYears ?? null,
      claimedJobs: s.claimedJobs ?? null,
      claimedCapexUsd: s.claimedCapexUsd ?? null,
      sources: s.sources,
      verified: true,
    });
    subsInserted++;
  }
  console.log(`  inserted: ${subsInserted}, skipped: ${subsSkipped}`);

  // ── 6. Insert permits ──
  console.log(`Inserting ${PERMITS.length} permits...`);
  let permsInserted = 0;
  let permsSkipped = 0;
  const missingDcsForPermits = new Set<string>();
  for (const p of PERMITS) {
    const dcId = dcMap.get(p.datacenterSlug);
    if (!dcId) {
      missingDcsForPermits.add(p.datacenterSlug);
      permsSkipped++;
      continue;
    }
    const dup = await db
      .select({ id: permits.id })
      .from(permits)
      .where(
        and(
          eq(permits.datacenterId, dcId),
          eq(permits.kind, p.kind),
          eq(permits.issuingBody, p.issuingBody),
        ),
      )
      .limit(1);
    if (dup.length) {
      permsSkipped++;
      continue;
    }
    // Coerce partial dates to null — only YYYY-MM-DD (10 char) accepted by postgres date type.
    // Year-only / month-level dates from audit live in notes; precision can be improved later.
    const fullDate = (s: string | undefined): string | null =>
      s && s.length === 10 ? s : null;
    await db.insert(permits).values({
      datacenterId: dcId,
      kind: p.kind,
      issuingBody: p.issuingBody,
      appliedDate: fullDate(p.appliedDate),
      issuedDate: fullDate(p.issuedDate),
      status: p.status,
      sources: p.sources,
      verified: true,
    });
    permsInserted++;
  }
  console.log(`  inserted: ${permsInserted}, skipped: ${permsSkipped}`);

  // ── 7. Update capex on datacenters ──
  console.log(`Updating capex on ${CAPEX_UPDATES.length} facilities...`);
  let capexUpdated = 0;
  let capexSkipped = 0;
  const missingDcsForCapex = new Set<string>();
  for (const c of CAPEX_UPDATES) {
    const dcId = dcMap.get(c.datacenterSlug);
    if (!dcId) {
      missingDcsForCapex.add(c.datacenterSlug);
      capexSkipped++;
      continue;
    }
    await db
      .update(datacenters)
      .set({ capexUsd: c.capexUsd, updatedAt: new Date() })
      .where(eq(datacenters.id, dcId));
    capexUpdated++;
  }
  console.log(`  updated: ${capexUpdated}, skipped: ${capexSkipped}`);

  // ── 8. Backfill status_history from existing date fields ──
  console.log(`Backfilling status_history from datacenter date fields...`);
  await db.execute(sql`
    INSERT INTO "app"."datacenter_status_history" (datacenter_id, status, effective_date, notes)
    SELECT d.id, 'announced', d.announced_date, 'Backfilled from datacenter.announced_date'
    FROM "app"."datacenter" d
    WHERE d.announced_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "app"."datacenter_status_history" h
        WHERE h.datacenter_id = d.id AND h.status = 'announced'
      );
  `);
  await db.execute(sql`
    INSERT INTO "app"."datacenter_status_history" (datacenter_id, status, effective_date, notes)
    SELECT d.id, 'under-construction', d.groundbreak_date, 'Backfilled from datacenter.groundbreak_date'
    FROM "app"."datacenter" d
    WHERE d.groundbreak_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "app"."datacenter_status_history" h
        WHERE h.datacenter_id = d.id AND h.status = 'under-construction'
      );
  `);
  await db.execute(sql`
    INSERT INTO "app"."datacenter_status_history" (datacenter_id, status, effective_date, notes)
    SELECT d.id, 'operational', d.online_date, 'Backfilled from datacenter.online_date'
    FROM "app"."datacenter" d
    WHERE d.online_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "app"."datacenter_status_history" h
        WHERE h.datacenter_id = d.id AND h.status = 'operational'
      );
  `);
  const [hist] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(datacenterStatusHistory);
  console.log(`  status_history rows now: ${hist?.n ?? 0}`);

  // ── Report missing slugs ──
  if (missingBrandsForEdges.size) {
    console.warn(
      `Missing brand slugs (ownership):`,
      [...missingBrandsForEdges].sort(),
    );
  }
  if (missingDcsForSubs.size) {
    console.warn(
      `Missing datacenter slugs (subsidies):`,
      [...missingDcsForSubs].sort(),
    );
  }
  if (missingDcsForPermits.size) {
    console.warn(
      `Missing datacenter slugs (permits):`,
      [...missingDcsForPermits].sort(),
    );
  }
  if (missingDcsForCapex.size) {
    console.warn(
      `Missing datacenter slugs (capex):`,
      [...missingDcsForCapex].sort(),
    );
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
