import { cache } from "react";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  AI_TOOLS_LIST_CATEGORIES,
  isAiToolsHubStartup,
} from "@/lib/investigations/ai-tools-list";
import {
  isThinStartupProfile,
  startupProfileIndexInput,
} from "@/lib/investigations/startup-profile-index";
import {
  displayStartupFounders,
  displayStartupInvestors,
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
  isNoindexOpenJob,
  OPEN_JOB_JS_WHITESPACE,
  OPEN_JOB_NON_BMP_PATTERN,
  openJobSitemapDescription,
  openJobSitemapNeedsBody,
} from "@/lib/investigations/job-indexability";
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

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const record = error as { message?: unknown; cause?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return `${message}\n${errorText(record.cause)}`;
}

/** Preview builds skip migrations, so `uses_ai` may not exist yet. */
function isMissingUsesAiColumn(error: unknown): boolean {
  return errorText(error).includes("uses_ai");
}

const startupColumnsWithoutUsesAi = (() => {
  const { usesAi, ...columns } = getTableColumns(startups);
  void usesAi;
  return columns;
})();

async function listApprovedStartupRows() {
  const where = eq(startups.status, "approved");
  const order = [desc(startups.listedOn), desc(startups.createdAt)] as const;
  try {
    return await db
      .select()
      .from(startups)
      .where(where)
      .orderBy(...order);
  } catch (error) {
    if (!isMissingUsesAiColumn(error)) throw error;
    const rows = await db
      .select(startupColumnsWithoutUsesAi)
      .from(startups)
      .where(where)
      .orderBy(...order);
    return rows.map((row) => ({ ...row, usesAi: null }));
  }
}

async function findStartupRowBySlug(slug: string) {
  const where = eq(startups.slug, slug);
  try {
    const [row] = await db.select().from(startups).where(where).limit(1);
    return row ?? null;
  } catch (error) {
    if (!isMissingUsesAiColumn(error)) throw error;
    const [row] = await db
      .select(startupColumnsWithoutUsesAi)
      .from(startups)
      .where(where)
      .limit(1);
    return row ? { ...row, usesAi: null } : null;
  }
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
    investors: displayStartupInvestors(row.investors),
    exitStatus: parseStartupExitStatus(row.exitStatus),
    acquirer: presentText(row.acquirer),
    exitOn: parseStartupExitOn(row.exitOn),
    jobsUrl: row.jobsUrl ? normalizeStartupHomepage(row.jobsUrl) : null,
    listedOn: row.listedOn,
    slug: parseStartupSlug(row.slug) ?? startupSlugFromName(row.name),
    openRoleCount: asFiniteCount(row.openRoleCount),
    usesAi: row.usesAi ?? null,
  };
}

/** Public directory. DB only — empty table or query failure is a soft empty. */
export async function listApprovedPublicStartups(): Promise<
  StartupPublicCard[]
> {
  try {
    const rows = await listApprovedStartupRows();
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
    const row = await findStartupRowBySlug(parsed);
    if (row?.status === "approved") {
      return toPublicCard(row);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Approved public profile paths for the sitemap. Thin profiles (description
 * under 80 characters and no open roles) are omitted. The same
 * `isThinStartupProfile` check noindexes those URLs. A missing blurb can
 * still pass when `startupProfileIndexInput` supplies a sourced answer of
 * at least 80 characters. Enrichment that fills the description, or a scan
 * that records an open role, puts the profile back the same way.
 */
export async function listApprovedPublicStartupSlugs(): Promise<string[]> {
  try {
    const rows = await db
      .select({
        slug: startups.slug,
        description: startups.description,
        openRoleCount: startups.openRoleCount,
      })
      .from(startups)
      .where(eq(startups.status, "approved"));
    return rows.flatMap((row) => {
      const slug = parseStartupSlug(row.slug);
      if (!slug) return [];
      if (
        isThinStartupProfile(
          startupProfileIndexInput({
            slug,
            description: row.description,
            openRoleCount: asFiniteCount(row.openRoleCount),
          }),
        )
      ) {
        return [];
      }
      return [slug];
    });
  } catch {
    return [];
  }
}

/**
 * Approved agents and models that the thin-profile rule still indexes.
 * Sorted by name. Soft-empty when the query fails. No writes.
 */
export async function listAiToolsHubStartups(): Promise<StartupPublicCard[]> {
  const where = and(
    eq(startups.status, "approved"),
    inArray(startups.category, [...AI_TOOLS_LIST_CATEGORIES]),
  );
  try {
    let rows;
    try {
      rows = await db.select().from(startups).where(where);
    } catch (error) {
      if (!isMissingUsesAiColumn(error)) throw error;
      const legacy = await db
        .select(startupColumnsWithoutUsesAi)
        .from(startups)
        .where(where);
      rows = legacy.map((row) => ({ ...row, usesAi: null }));
    }
    return rows
      .map((row) => toPublicCard(row))
      .filter((card) => isAiToolsHubStartup(card))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
          a.slug.localeCompare(b.slug),
      );
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
  isAi: startupRoles.isAi,
};

const { isAi: _startupRoleIsAi, ...startupRoleColumnsWithoutIsAi } =
  getTableColumns(startupRoles);
void _startupRoleIsAi;

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
    isAi: role.isAi ?? null,
  };
}

/** Preview builds skip migrations, so `is_ai` may not exist yet. */
function isMissingIsAiColumn(error: unknown): boolean {
  return errorText(error).includes("is_ai");
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
const { isAi: _listingIsAi, ...startupRoleListingColumnsWithoutIsAi } =
  startupRoleListingColumns;
void _listingIsAi;

function publicRoleListings(
  rows: Array<{
    role: StartupRoleListingRow;
    startupSlug: string;
    startupName: string;
    startupLogoUrl: string | null;
  }>,
): StartupRoleListing[] {
  return rows.flatMap((row) => {
    const role = toPublicRoleListing(row.role, {
      slug: row.startupSlug,
      name: row.startupName,
      logoUrl: row.startupLogoUrl,
    });
    return role ? [role] : [];
  });
}

export const listPublicStartupRoles = cache(
  async (): Promise<StartupRoleListing[]> => {
    const order = [
      desc(startupRoles.fetchedAt),
      desc(startupRoles.createdAt),
    ] as const;
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
        .orderBy(...order);
      return publicRoleListings(rows);
    } catch (error) {
      if (!isMissingIsAiColumn(error)) return [];
      try {
        const rows = await db
          .select({
            role: startupRoleListingColumnsWithoutIsAi,
            startupSlug: startups.slug,
            startupName: startups.name,
            startupLogoUrl: startups.logoUrl,
          })
          .from(startupRoles)
          .innerJoin(startups, eq(startupRoles.startupId, startups.id))
          .where(publicOpenRole)
          .orderBy(...order);
        return publicRoleListings(
          rows.map((row) => ({ ...row, role: { ...row.role, isAi: null } })),
        );
      } catch {
        return [];
      }
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
 * count, which beats matches that need the description (D).
 *
 * `ts_rank` alone cannot do this. For an AND query it scores the proximity
 * of whichever query lexemes it finds, not whether all words are present;
 * and a word whose stem differs from its spelling ("remote" → `remot`,
 * `remote`) is two nearby lexemes here. So a role titled "Other | Remote"
 * scored near full for "remote research" with "research" only in its
 * description.
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
 * Returns role id → best-match order (0 first): match tier; within a tier,
 * `ts_rank` on title, company, location and work type, so a long
 * description repeating a word cannot outrank a short exact title; then
 * `ts_rank` on everything; then company and title so equal scores stay
 * stable.
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
          desc(
            sql`ts_rank(ts_filter(${startupRoleSearchVector}, '{a,b,c}'), (${tsQuery}))`,
          ),
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

function companyOpenRoles(
  rows: Array<{
    role: typeof startupRoles.$inferSelect;
    startupSlug: string;
    startupName: string;
    startupLogoUrl: string | null;
  }>,
): StartupRolePublic[] {
  return rows.flatMap((row) => {
    const role = toPublicRole(row.role, {
      slug: row.startupSlug,
      name: row.startupName,
      logoUrl: row.startupLogoUrl,
    });
    return role ? [role] : [];
  });
}

export async function listOpenStartupRolesForCompany(
  startupId: string,
): Promise<StartupRolePublic[]> {
  const where = and(
    eq(startupRoles.startupId, startupId),
    eq(startupRoles.status, "open"),
    eq(startups.status, "approved"),
  );
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
      .where(where)
      .orderBy(desc(startupRoles.fetchedAt));
    return companyOpenRoles(rows);
  } catch (error) {
    if (!isMissingIsAiColumn(error)) return [];
    try {
      const rows = await db
        .select({
          role: startupRoleColumnsWithoutIsAi,
          startupSlug: startups.slug,
          startupName: startups.name,
          startupLogoUrl: startups.logoUrl,
        })
        .from(startupRoles)
        .innerJoin(startups, eq(startupRoles.startupId, startups.id))
        .where(where)
        .orderBy(desc(startupRoles.fetchedAt));
      return companyOpenRoles(
        rows.map((row) => ({
          ...row,
          role: { ...row.role, isAi: null },
        })),
      );
    } catch {
      return [];
    }
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
  } catch (error) {
    if (!isMissingIsAiColumn(error)) return null;
    try {
      const parsed = parseStartupSlug(slug);
      if (!parsed) return null;
      const [row] = await db
        .select({
          role: startupRoleColumnsWithoutIsAi,
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
      return toPublicRole(
        { ...row.role, isAi: null },
        {
          slug: row.startupSlug,
          name: row.startupName,
          logoUrl: row.startupLogoUrl,
        },
      );
    } catch {
      return null;
    }
  }
}

/**
 * Open role paths for the sitemap. Thin descriptions and titles rejected by
 * the #438 filter are omitted. The job page uses the same `isNoindexOpenJob`
 * check. Closed roles are already excluded by status.
 *
 * Descriptions together are tens of megabytes, so this loads lengths only.
 * The stored text is fetched for the small band whose length can still cross
 * 200 characters after sanitize. A failure of that second read drops the band,
 * and leaves every other open role in the sitemap.
 */
export async function listOpenStartupRoleSlugs(): Promise<string[]> {
  try {
    const rows = await db
      .select({
        slug: startupRoles.slug,
        title: startupRoles.title,
        rawChars: sql<number>`char_length(coalesce(${startupRoles.descriptionText}, ''))::int`,
        nonWsChars: sql<number>`char_length(regexp_replace(regexp_replace(coalesce(${startupRoles.descriptionText}, ''), ${`[${OPEN_JOB_JS_WHITESPACE}]`}, '', 'g'), ${OPEN_JOB_NON_BMP_PATTERN}, '', 'g'))::int`,
      })
      .from(startupRoles)
      .innerJoin(startups, eq(startupRoles.startupId, startups.id))
      .where(
        and(eq(startups.status, "approved"), eq(startupRoles.status, "open")),
      );
    const bandSlugs = rows.flatMap((row) => {
      const slug = parseStartupSlug(row.slug);
      if (!slug) return [];
      return openJobSitemapNeedsBody({
        rawChars: asFiniteCount(row.rawChars),
        nonWsChars: asFiniteCount(row.nonWsChars),
      })
        ? [slug]
        : [];
    });
    const bodies = await listSitemapRoleDescriptionBodies(bandSlugs);
    return rows.flatMap((row) => {
      const slug = parseStartupSlug(row.slug);
      if (!slug) return [];
      const rawChars = asFiniteCount(row.rawChars);
      const nonWsChars = asFiniteCount(row.nonWsChars);
      const descriptionText = openJobSitemapDescription({
        rawChars,
        nonWsChars,
        body: bodies.get(slug),
      });
      if (isNoindexOpenJob({ title: row.title, descriptionText })) return [];
      return [slug];
    });
  } catch {
    return [];
  }
}

/**
 * Band slugs only. An empty list skips the query. A failure returns an empty
 * map so those roles stay out of the sitemap instead of dropping every role.
 */
async function listSitemapRoleDescriptionBodies(
  slugs: readonly string[],
): Promise<Map<string, string | null>> {
  if (slugs.length === 0) return new Map();
  try {
    const rows = await db
      .select({
        slug: startupRoles.slug,
        descriptionText: startupRoles.descriptionText,
      })
      .from(startupRoles)
      .where(inArray(startupRoles.slug, [...slugs]));
    return new Map(
      rows.flatMap((row) => {
        const slug = parseStartupSlug(row.slug);
        return slug ? [[slug, row.descriptionText] as const] : [];
      }),
    );
  } catch {
    return new Map();
  }
}
