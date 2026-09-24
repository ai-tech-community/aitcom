import { cache } from "react";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";

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
import { isStartupCountryCode } from "@/lib/investigations/startups-countries";
import {
  parseStartupRoleTitle,
  sanitizeStartupRoleDescription,
  type StartupRoleListing,
  type StartupRolePublic,
  type StartupRoleTextMatches,
} from "@/lib/investigations/startup-roles";
import {
  startupRoleSearchPlan,
  type StartupRoleSearchTerm,
} from "@/lib/investigations/startup-jobs-search";
import { db } from "@/server/db";
import { startupRoles, startups } from "@/server/db/schema";

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
    country: isStartupCountryCode(row.country) ? row.country : null,
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

/** Every role column except the description, which the jobs list never shows. */
const startupRoleListingColumns = {
  id: startupRoles.id,
  startupId: startupRoles.startupId,
  slug: startupRoles.slug,
  title: startupRoles.title,
  location: startupRoles.location,
  workType: startupRoles.workType,
  sourceUrl: startupRoles.sourceUrl,
  applyUrl: startupRoles.applyUrl,
  fetchedAt: startupRoles.fetchedAt,
  postedAt: startupRoles.postedAt,
  board: startupRoles.board,
  status: startupRoles.status,
  createdAt: startupRoles.createdAt,
};

type StartupRoleListingRow = {
  [K in keyof typeof startupRoleListingColumns]: (typeof startupRoles.$inferSelect)[K];
};

type StartupRoleOwner = {
  slug: string;
  name: string;
  logoUrl: string | null;
};

function toPublicRoleListing(
  role: StartupRoleListingRow,
  startup: StartupRoleOwner,
): StartupRoleListing | null {
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
    fetchedAt: role.fetchedAt.toISOString(),
    listedAt: role.createdAt.toISOString(),
    postedAt: role.postedAt?.toISOString() ?? null,
    board: role.board,
    status: role.status,
  };
}

export function toPublicRole(
  role: typeof startupRoles.$inferSelect,
  startup: StartupRoleOwner,
): StartupRolePublic | null {
  const listing = toPublicRoleListing(role, startup);
  if (!listing) return null;
  return {
    ...listing,
    descriptionText: sanitizeStartupRoleDescription(role.descriptionText),
  };
}

const publicOpenRole = and(
  eq(startups.status, "approved"),
  eq(startupRoles.status, "open"),
);

/**
 * Every public open role, without descriptions. Cached per request: the jobs
 * page reads it for both its metadata and its body.
 */
export const listPublicStartupRoles = cache(
  async (): Promise<StartupRoleListing[]> => {
    try {
      const rows = await db
        .select({
          role: startupRoleListingColumns,
          startupSlug: startups.slug,
          startupName: startups.name,
          startupLogoUrl: startups.logoUrl,
        })
        .from(startupRoles)
        .innerJoin(startups, eq(startupRoles.startupId, startups.id))
        .where(publicOpenRole)
        .orderBy(desc(startupRoles.fetchedAt), desc(startupRoles.createdAt));
      return rows.flatMap((row) => {
        const role = toPublicRoleListing(row.role, {
          slug: row.startupSlug,
          name: row.startupName,
          logoUrl: row.startupLogoUrl,
        });
        return role ? [role] : [];
      });
    } catch {
      return [];
    }
  },
);

/**
 * Trigger-maintained column, kept out of the Drizzle table so whole-row
 * selects do not carry it. See the note on `startupRoles` in the schema.
 */
const startupRoleSearchVector = sql`${startupRoles}."search_vector"`;

/**
 * One search word as a tsquery. The stemmed `english` form finds other forms
 * of a whole word ("engineers" → "engineer"). The unstemmed `simple` form
 * finds the word as written: as a prefix for a half-typed word, and exactly
 * for a short one `english` drops as a stop word ("IT"). The vector carries
 * both forms (see the migration). Terms are letters and digits only, so `:*`
 * is the only syntax added.
 */
function searchTermTsQuery({ term, prefix }: StartupRoleSearchTerm): SQL {
  const asWritten = prefix
    ? sql`to_tsquery('simple', ${`${term}:*`})`
    : sql`plainto_tsquery('simple', ${term})`;
  return sql`(plainto_tsquery('english', ${term}) || ${asWritten})`;
}

/**
 * Match tier for best-match order: every word found in the title or company
 * (weights A, B) beats every word found once location and work type (C)
 * count, which beats matches that need the description (D). Postgres's
 * `ts_rank` alone gives near-full credit for a partial title hit, so a role
 * titled "Engineer" at another company would outrank the searched
 * company's own roles; the tier keeps "acme engineer" on Acme.
 */
function searchMatchTier(tsQuery: SQL): SQL<number> {
  return sql<number>`case
    when ts_filter(${startupRoleSearchVector}, '{a,b}') @@ (${tsQuery}) then 2
    when ts_filter(${startupRoleSearchVector}, '{a,b,c}') @@ (${tsQuery}) then 1
    else 0
  end`;
}

/**
 * Full-text search over public open roles: title, company, location, work
 * type and description, so a search can span company and role ("stripe
 * engineer"). One GIN-indexed lookup on the trigger-maintained
 * `search_vector` column (migration 20260924c_startup_role_search).
 *
 * Returns role id → best-match order (0 first): match tier, then `ts_rank`
 * within the tier, then company and title so equal scores stay stable.
 * Returns `null` when `q` has no search terms.
 */
export const matchPublicStartupRoleIds = cache(
  async (q: string): Promise<StartupRoleTextMatches> => {
    const plan = startupRoleSearchPlan(q);
    if (plan.length === 0) return null;
    const tsQuery = sql.join(plan.map(searchTermTsQuery), sql` && `);
    try {
      const rows = await db
        .select({ id: startupRoles.id })
        .from(startupRoles)
        .innerJoin(startups, eq(startupRoles.startupId, startups.id))
        .where(
          and(publicOpenRole, sql`${startupRoleSearchVector} @@ (${tsQuery})`),
        )
        .orderBy(
          desc(searchMatchTier(tsQuery)),
          desc(sql`ts_rank(${startupRoleSearchVector}, (${tsQuery}))`),
          asc(startups.name),
          asc(startupRoles.title),
          asc(startupRoles.id),
        );
      return new Map(rows.map((row, order) => [row.id, order]));
    } catch (error) {
      console.error("[startups] jobs full-text search failed", error);
      return new Map();
    }
  },
);

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
