import { and, count, desc, eq, isNull } from "drizzle-orm";

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
import {
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
  type StartupRolePublic,
} from "@/lib/investigations/startup-roles";
import { db } from "@/server/db";
import { communities, startupRoles, startups } from "@/server/db/schema";

function asFiniteCount(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toPublicCard(row: typeof startups.$inferSelect): StartupPublicCard {
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
    openRoleCount: asFiniteCount(row.openRoleCount),
  };
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
    return rows.map((row) => toPublicCard(row));
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
      return toPublicCard(row);
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
  const title = parseStartupRoleTitle(role.title) ?? presentText(role.title);
  if (!title) return null;
  return {
    id: role.id,
    startupId: role.startupId,
    startupSlug,
    startupName: startup.name,
    startupLogoUrl: presentText(startup.logoUrl),
    slug,
    title,
    location: presentText(role.location),
    workType: presentText(role.workType),
    sourceUrl: role.sourceUrl,
    applyUrl: presentText(role.applyUrl),
    descriptionText: sanitizeStartupRoleDescription(role.descriptionText),
    fetchedAt: role.fetchedAt.toISOString(),
    listedAt: role.createdAt.toISOString(),
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

export async function listListedCommunities(): Promise<
  { slug: string; name: string }[]
> {
  try {
    return await db
      .select({ slug: communities.slug, name: communities.name })
      .from(communities)
      .where(
        and(
          eq(communities.isListedInDirectory, true),
          isNull(communities.deletedAt),
        ),
      )
      .orderBy(communities.name)
      .limit(40);
  } catch {
    return [];
  }
}
