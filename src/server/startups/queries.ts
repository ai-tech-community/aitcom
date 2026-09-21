import { and, count, desc, eq, inArray } from "drizzle-orm";

import {
  displayStartupFounders,
  displayStartupSources,
  parseStartupExitOn,
  parseStartupExitStatus,
  parseStartupSlug,
  presentText,
  normalizeStartupHomepage,
  startupSlugFromName,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";
import { db } from "@/server/db";
import { startupRoles, startups } from "@/server/db/schema";

function asFiniteCount(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toPublicCard(
  row: typeof startups.$inferSelect,
  openRoleCount = 0,
): StartupPublicCard {
  return {
    id: row.id,
    name: row.name,
    homepage: row.homepage,
    category: row.category,
    sources: displayStartupSources(row.sources ?? []),
    region: presentText(row.region),
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    stage: presentText(row.stage),
    logoUrl: presentText(row.logoUrl),
    description: presentText(row.description),
    founders: displayStartupFounders(row.founders),
    exitStatus: parseStartupExitStatus(row.exitStatus),
    acquirer: presentText(row.acquirer),
    exitOn: parseStartupExitOn(row.exitOn),
    jobsUrl: row.jobsUrl ? normalizeStartupHomepage(row.jobsUrl) : null,
    listedOn: row.listedOn,
    slug: parseStartupSlug(row.slug) ?? startupSlugFromName(row.name),
    openRoleCount,
  };
}

async function openRoleCountByStartup(
  ids: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  try {
    const rows = await db
      .select({
        startupId: startupRoles.startupId,
        value: count(),
      })
      .from(startupRoles)
      .where(
        and(
          inArray(startupRoles.startupId, [...ids]),
          eq(startupRoles.status, "open"),
        ),
      )
      .groupBy(startupRoles.startupId);
    for (const row of rows) {
      counts.set(row.startupId, asFiniteCount(row.value));
    }
  } catch {
    return counts;
  }
  return counts;
}

/** Public directory. DB only — empty table or query failure is a soft empty. */
export async function listApprovedPublicStartups(): Promise<
  StartupPublicCard[]
> {
  try {
    const rows = await db
      .select()
      .from(startups)
      .where(eq(startups.status, "approved"))
      .orderBy(desc(startups.listedOn), desc(startups.createdAt));
    const counts = await openRoleCountByStartup(rows.map((row) => row.id));
    return rows.map((row) => toPublicCard(row, counts.get(row.id) ?? 0));
  } catch {
    return [];
  }
}

/** Listed row count for sitemap pagination — no card payload. */
export async function countApprovedPublicStartups(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: count() })
      .from(startups)
      .where(eq(startups.status, "approved"));
    return asFiniteCount(row?.value);
  } catch {
    return 0;
  }
}

/**
 * Same listed set the Directory / ItemList read. Prefer COUNT(*); if that
 * soft-fails to 0, fall back to `listApprovedPublicStartups().length`.
 */
export async function listedPublicStartupCount(): Promise<number> {
  const counted = await countApprovedPublicStartups();
  if (counted > 0) return counted;
  return (await listApprovedPublicStartups()).length;
}

export async function findStartupByHomepage(homepage: string) {
  const [row] = await db
    .select()
    .from(startups)
    .where(eq(startups.homepage, homepage))
    .limit(1);
  return row ?? null;
}

export async function findStartupById(id: string) {
  const [row] = await db
    .select()
    .from(startups)
    .where(eq(startups.id, id))
    .limit(1);
  return row ?? null;
}

export async function findStartupBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(startups)
    .where(eq(startups.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function findApprovedPublicStartupBySlug(
  slug: string,
): Promise<StartupPublicCard | null> {
  try {
    const parsed = parseStartupSlug(slug);
    if (!parsed) return null;
    const [row] = await db
      .select()
      .from(startups)
      .where(eq(startups.slug, parsed))
      .limit(1);
    if (row?.status === "approved") {
      const counts = await openRoleCountByStartup([row.id]);
      return toPublicCard(row, counts.get(row.id) ?? 0);
    }
    return null;
  } catch {
    return null;
  }
}

export async function listApprovedPublicStartupSlugs(): Promise<string[]> {
  try {
    const rows = await db
      .select({ slug: startups.slug })
      .from(startups)
      .where(eq(startups.status, "approved"));
    return rows.flatMap((row) => {
      const slug = parseStartupSlug(row.slug);
      return slug ? [slug] : [];
    });
  } catch {
    return [];
  }
}

function toPublicRole(
  role: typeof startupRoles.$inferSelect,
  startup: {
    slug: string;
    name: string;
    logoUrl: string | null;
  },
): StartupRolePublic | null {
  if (role.status === "pending_review") return null;
  const slug = parseStartupSlug(role.slug);
  const startupSlug = parseStartupSlug(startup.slug);
  if (!slug || !startupSlug) return null;
  return {
    id: role.id,
    startupId: role.startupId,
    startupSlug,
    startupName: startup.name,
    startupLogoUrl: presentText(startup.logoUrl),
    slug,
    title: role.title,
    location: presentText(role.location),
    workType: presentText(role.workType),
    sourceUrl: role.sourceUrl,
    applyUrl: presentText(role.applyUrl),
    descriptionText: presentText(role.descriptionText),
    fetchedAt: role.fetchedAt.toISOString(),
    board: role.board,
    status: role.status,
  };
}

export async function listPublicStartupRoles(): Promise<StartupRolePublic[]> {
  try {
    const rows = await db
      .select({
        role: startupRoles,
        startupSlug: startups.slug,
        startupName: startups.name,
        startupLogoUrl: startups.logoUrl,
        startupStatus: startups.status,
      })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(
        and(eq(startups.status, "approved"), eq(startupRoles.status, "open")),
      )
      .orderBy(desc(startupRoles.fetchedAt), desc(startupRoles.createdAt));
    return rows.flatMap((row) => {
      const role = toPublicRole(row.role, {
        slug: row.startupSlug,
        name: row.startupName,
        logoUrl: row.startupLogoUrl,
      });
      return role ? [role] : [];
    });
  } catch {
    return [];
  }
}

export async function listOpenStartupRolesForCompany(
  startupId: string,
): Promise<StartupRolePublic[]> {
  try {
    const rows = await db
      .select({
        role: startupRoles,
        startupSlug: startups.slug,
        startupName: startups.name,
        startupLogoUrl: startups.logoUrl,
      })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(
        and(
          eq(startupRoles.startupId, startupId),
          eq(startupRoles.status, "open"),
          eq(startups.status, "approved"),
        ),
      )
      .orderBy(desc(startupRoles.fetchedAt));
    return rows.flatMap((row) => {
      const role = toPublicRole(row.role, {
        slug: row.startupSlug,
        name: row.startupName,
        logoUrl: row.startupLogoUrl,
      });
      return role ? [role] : [];
    });
  } catch {
    return [];
  }
}

export async function findPublicStartupRoleBySlug(
  slug: string,
): Promise<StartupRolePublic | null> {
  try {
    const parsed = parseStartupSlug(slug);
    if (!parsed) return null;
    const [row] = await db
      .select({
        role: startupRoles,
        startupSlug: startups.slug,
        startupName: startups.name,
        startupLogoUrl: startups.logoUrl,
        startupStatus: startups.status,
      })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(eq(startupRoles.slug, parsed))
      .limit(1);
    if (row?.startupStatus !== "approved") return null;
    if (row.role.status === "pending_review") return null;
    return toPublicRole(row.role, {
      slug: row.startupSlug,
      name: row.startupName,
      logoUrl: row.startupLogoUrl,
    });
  } catch {
    return null;
  }
}

export async function listOpenStartupRoleSlugs(): Promise<string[]> {
  try {
    const rows = await db
      .select({ slug: startupRoles.slug })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(
        and(eq(startups.status, "approved"), eq(startupRoles.status, "open")),
      );
    return rows.flatMap((row) => {
      const slug = parseStartupSlug(row.slug);
      return slug ? [slug] : [];
    });
  } catch {
    return [];
  }
}
