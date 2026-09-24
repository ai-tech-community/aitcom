/**
 * DB-INTEGRATION test for jobs full-text search and best-match order
 * (migration 20260924c_startup_role_search, matchPublicStartupRoleIds).
 *
 * AUTO-SKIPS unless RUN_DB_TESTS=1 and a local-looking DATABASE_URL is set.
 * See work-grid.integration.test.ts for the gate rationale. The database
 * needs the app migrations applied.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
 *     NEON_LOCAL_PROXY=localhost:5433 \
 *     pnpm exec vitest run src/server/startups/jobs-search.integration.test.ts
 *
 * Fixture companies are made up. Other rows in the database may match the
 * same words, so assertions look only at the fixture roles' relative order.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("jobs full-text search [DB integration]", () => {
  let db: typeof import("@/server/db").db;
  let schema: typeof import("@/server/db/schema");
  let match: typeof import("./queries").matchPublicStartupRoleIds;

  const run = Math.random().toString(36).slice(2, 8);
  const startupIds: string[] = [];
  const roleIds: Record<string, string> = {};

  /** Fixture role keys in best-match order for `q`. */
  async function order(q: string): Promise<string[]> {
    const matches = await match(q);
    const byId = new Map(Object.entries(roleIds).map(([k, id]) => [id, k]));
    return [...(matches ?? new Map<string, number>()).entries()]
      .sort((a, b) => a[1] - b[1])
      .flatMap(([id]) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  async function addStartup(name: string): Promise<string> {
    const slug = `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`;
    const [row] = await db
      .insert(schema.startups)
      .values({
        name,
        slug,
        homepage: `https://${slug}.example.com`,
        category: "other",
        listedOn: "2026-09-24",
      })
      .returning({ id: schema.startups.id });
    startupIds.push(row!.id);
    return row!.id;
  }

  async function addRole(
    key: string,
    startupId: string,
    fields: { title: string; location?: string; descriptionText?: string },
  ): Promise<void> {
    const [row] = await db
      .insert(schema.startupRoles)
      .values({
        startupId,
        slug: `${key}-${run}`,
        title: fields.title,
        location: fields.location ?? null,
        descriptionText: fields.descriptionText ?? null,
        sourceUrl: `https://example.com/${key}-${run}`,
        fetchedAt: new Date(),
        board: "html",
        status: "open",
      })
      .returning({ id: schema.startupRoles.id });
    roleIds[key] = row!.id;
  }

  beforeAll(async () => {
    const [dbMod, schemaMod, queriesMod] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./queries"),
    ]);
    db = dbMod.db;
    schema = schemaMod;
    match = queriesMod.matchPublicStartupRoleIds;

    const vorpalix = await addStartup("Vorpalix");
    const brillig = await addStartup("Brillig Labs");
    await addRole("vorpalixEngineer", vorpalix, {
      title: "Platform Engineer",
      descriptionText: "Build the platform.",
    });
    await addRole("vorpalixIt", vorpalix, { title: "IT Wrangler" });
    await addRole("brilligMentionsVorpalix", brillig, {
      title: "Staff Engineer",
      descriptionText: "We integrate with Vorpalix every day.",
    });
    await addRole("brilligTitle", brillig, { title: "Frumious Analyst" });
    await addRole("brilligLocation", brillig, {
      title: "Analyst",
      location: "Frumious Bay",
    });
    await addRole("brilligWordsInTitleAndLocation", brillig, {
      title: "Bandersnatch Researcher",
      location: "Jabbering Bay",
    });
    await addRole("brilligOneWordInShortTitle", brillig, {
      title: "Jabbering",
      descriptionText: "Some bandersnatch work.",
    });
    await addRole("brilligDescription", brillig, {
      title: "Analyst",
      descriptionText: "frumious ".repeat(200),
    });
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray } = await import("drizzle-orm");
    await db
      .delete(schema.startupRoles)
      .where(inArray(schema.startupRoles.startupId, startupIds));
    await db
      .delete(schema.startups)
      .where(inArray(schema.startups.id, startupIds));
  });

  it("ranks the searched company's own role above a description mention", async () => {
    expect(await order("vorpalix engineer")).toEqual([
      "vorpalixEngineer",
      "brilligMentionsVorpalix",
    ]);
  });

  it("ranks title, then location, then description-only matches", async () => {
    // The description repeats the word 200 times and still ranks last.
    expect(await order("frumious")).toEqual([
      "brilligTitle",
      "brilligLocation",
      "brilligDescription",
    ]);
  });

  it("ranks every word in title and location above one word in a short title", async () => {
    // "Jabbering" is indexed as the stem "jabber" and as written, so ts_rank
    // alone sees two nearby hits in the short title and scores it near full,
    // although "bandersnatch" is only in the description (seen on real data:
    // "remote research" ranked a role titled "Other | Remote" first).
    expect(await order("bandersnatch jabbering")).toEqual([
      "brilligWordsInTitleAndLocation",
      "brilligOneWordInShortTitle",
    ]);
  });

  it("matches half-typed words and short stop words", async () => {
    expect(await order("vorpali")).toContain("vorpalixEngineer");
    expect(await order("vorpalix enginee")).toContain("vorpalixEngineer");
    expect(await order("IT")).toContain("vorpalixIt");
  });

  it("keeps the vector current when a role or its company changes", async () => {
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.startupRoles)
      .set({ descriptionText: "Now about tulgey pipelines." })
      .where(eq(schema.startupRoles.id, roleIds.vorpalixEngineer!));
    expect(await order("tulgey")).toEqual(["vorpalixEngineer"]);

    await db
      .update(schema.startups)
      .set({ name: "Slithy Labs" })
      .where(eq(schema.startups.id, startupIds[1]!));
    // All three hold both words in title and company, so compare as a set.
    expect((await order("slithy analyst")).sort()).toEqual(
      ["brilligDescription", "brilligLocation", "brilligTitle"].sort(),
    );
  });
});
