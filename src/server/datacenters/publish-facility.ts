import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { routing } from "@/i18n/routing";
import {
  operatorMatches,
  publishFacilityWithRepo,
  type FacilityPermit,
  type FacilityPublishResult,
  type FacilityRepo,
  type FacilitySave,
  type StoredFacility,
} from "@/lib/investigations/datacenter-facilities";
import { db } from "@/server/db";
import {
  brands,
  datacenters,
  permits,
  type DatacenterSource,
} from "@/server/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Upsert one facility into the live investigations table.
 * Staff (Payload) and the agent endpoint both call this.
 */
export async function publishDatacenterFacility(
  input: unknown,
  now: Date = new Date(),
): Promise<FacilityPublishResult> {
  const result = await db.transaction(async (tx) =>
    publishFacilityWithRepo(input, repoFor(tx), now),
  );
  if (result.ok) revalidatePublishedFacility(result.slug);
  return result;
}

function revalidatePublishedFacility(slug: string): void {
  try {
    for (const locale of routing.locales) {
      revalidatePath(`/${locale}/investigations`);
      revalidatePath(`/${locale}/investigations/datacenters/${slug}`);
    }
    revalidatePath("/sitemap.xml");
  } catch (error) {
    console.error("[datacenter] revalidate failed", error);
  }
}

function repoFor(tx: Tx): FacilityRepo {
  return {
    findBySlug: (slug) => findBySlug(tx, slug),
    findByNameOperator: (name, operator) =>
      findByNameOperator(tx, name, operator),
    slugTaken: async (slug) => {
      const [row] = await tx
        .select({ id: datacenters.id })
        .from(datacenters)
        .where(eq(datacenters.slug, slug))
        .limit(1);
      return Boolean(row);
    },
    save: (input) => saveFacility(tx, input),
  };
}

async function findBySlug(
  tx: Tx,
  slug: string,
): Promise<StoredFacility | null> {
  const [row] = await tx
    .select({ facility: datacenters, brand: brands })
    .from(datacenters)
    .innerJoin(brands, eq(brands.id, datacenters.operatorId))
    .where(eq(datacenters.slug, slug))
    .limit(1);
  if (!row) return null;
  return toStored(tx, row.facility, row.brand);
}

async function findByNameOperator(
  tx: Tx,
  name: string,
  operator: string,
): Promise<StoredFacility | null> {
  const rows = await tx
    .select({ facility: datacenters, brand: brands })
    .from(datacenters)
    .innerJoin(brands, eq(brands.id, datacenters.operatorId))
    .where(sql`lower(${datacenters.name}) = ${name.trim().toLowerCase()}`);
  const hit = rows.find((row) =>
    operatorMatches(
      { slug: row.brand.slug, canonicalName: row.brand.canonicalName },
      operator,
    ),
  );
  if (!hit) return null;
  return toStored(tx, hit.facility, hit.brand);
}

async function toStored(
  tx: Tx,
  facility: typeof datacenters.$inferSelect,
  brand: { slug: string; canonicalName: string },
): Promise<StoredFacility> {
  const permitRows = await tx
    .select()
    .from(permits)
    .where(eq(permits.datacenterId, facility.id));
  return {
    id: facility.id,
    slug: facility.slug,
    name: facility.name,
    operatorKey: brand.slug,
    operatorName: brand.canonicalName,
    country: facility.country,
    city: facility.city,
    lat: Number(facility.lat),
    lng: Number(facility.lng),
    capacityMw: facility.capacityMw,
    status: facility.status as StoredFacility["status"],
    sourceUrl: facility.sourceUrl ?? "",
    checkedAt: facility.checkedAt ?? new Date(0),
    updatedAt: facility.updatedAt,
    sources: facility.sources ?? [],
    permits: permitRows.flatMap((row) => {
      const sourceUrl = (row.sources ?? []).find((source) =>
        source.url?.startsWith("https://"),
      )?.url;
      if (!sourceUrl) return [];
      return [
        {
          kind: row.kind as FacilityPermit["kind"],
          issuingBody: row.issuingBody,
          status: row.status as FacilityPermit["status"],
          appliedDate: row.appliedDate,
          issuedDate: row.issuedDate,
          sourceUrl,
        },
      ];
    }),
  };
}

async function resolveBrand(
  tx: Tx,
  operatorKey: string,
  operatorName: string,
): Promise<{ id: string }> {
  const [bySlug] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.slug, operatorKey))
    .limit(1);
  if (bySlug) return bySlug;
  const [byName] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(
      sql`lower(${brands.canonicalName}) = ${operatorName.trim().toLowerCase()}`,
    )
    .limit(1);
  if (byName) return byName;
  const [created] = await tx
    .insert(brands)
    .values({
      slug: operatorKey,
      canonicalName: operatorName,
      verified: true,
    })
    .returning({ id: brands.id });
  if (!created) throw new Error("operator could not be saved.");
  return created;
}

async function saveFacility(
  tx: Tx,
  input: FacilitySave,
): Promise<StoredFacility> {
  const brand = await resolveBrand(tx, input.operatorKey, input.operatorName);
  const shared = {
    name: input.name,
    slug: input.slug,
    operatorId: brand.id,
    status: input.status,
    lat: input.lat,
    lng: input.lng,
    country: input.country,
    city: input.city,
    capacityMw: input.capacityMw,
    sourceUrl: input.sourceUrl,
    checkedAt: input.checkedAt,
    sources: input.sources satisfies DatacenterSource[],
    verified: true,
    updatedAt: input.updatedAt,
  };
  const inserted = input.id
    ? null
    : (
        await tx
          .insert(datacenters)
          .values(shared)
          .returning({ id: datacenters.id })
      )[0];
  const id = input.id ?? inserted?.id;
  if (!id) throw new Error("facility could not be saved.");
  if (input.id) {
    await tx.update(datacenters).set(shared).where(eq(datacenters.id, id));
  }
  if (input.permits) {
    const existing = await tx
      .select()
      .from(permits)
      .where(eq(permits.datacenterId, id));
    for (const permit of input.permits) {
      const match = existing.find(
        (row) =>
          row.kind === permit.kind &&
          row.issuingBody.trim().toLowerCase() ===
            permit.issuingBody.trim().toLowerCase(),
      );
      const sources: DatacenterSource[] = [{ url: permit.sourceUrl }];
      const fields = {
        status: permit.status,
        appliedDate: permit.appliedDate,
        issuedDate: permit.issuedDate,
        sources,
        verified: true,
        updatedAt: input.updatedAt,
      };
      if (match) {
        await tx.update(permits).set(fields).where(eq(permits.id, match.id));
      } else {
        await tx.insert(permits).values({
          datacenterId: id,
          kind: permit.kind,
          issuingBody: permit.issuingBody,
          ...fields,
        });
      }
    }
  }
  const stored = await findBySlug(tx, input.slug);
  if (!stored) throw new Error("facility could not be read after save.");
  return stored;
}
