import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("spaces router [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    buildDefaultSpaceRows: typeof import("@/server/communities/space-defaults").buildDefaultSpaceRows;
  };
  let m: Mods;
  let communityId: string;
  let userId: string;

  beforeAll(async () => {
    const [{ db }, schema, { buildDefaultSpaceRows }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/communities/space-defaults"),
    ]);
    m = { db, schema, buildDefaultSpaceRows };
  });

  beforeEach(async () => {
    const { db, schema, buildDefaultSpaceRows } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    userId = `sp-owner-${suffix}`;
    await db.insert(schema.user).values({
      id: userId,
      email: `sp-${suffix}@example.test`,
      name: "Spaces Owner",
    });
    const [c] = await db
      .insert(schema.communities)
      .values({
        name: `Spaces Test ${suffix}`,
        slug: `spaces-test-${suffix}`,
        createdBy: userId,
      })
      .returning();
    communityId = c!.id;
    await db.insert(schema.spaces).values(buildDefaultSpaceRows(communityId));
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.spaces).where(eq(schema.spaces.communityId, communityId));
    await db.delete(schema.communities).where(eq(schema.communities.id, communityId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("seeds five ordered builtin spaces", async () => {
    const { db, schema } = m;
    const { eq, asc } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.spaces)
      .where(eq(schema.spaces.communityId, communityId))
      .orderBy(asc(schema.spaces.position));
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.builtinSurface)).toEqual([
      "forum",
      "events",
      "classroom",
      "ideas",
      "members",
    ]);
  });

  it("archiving a space hides it from an enabled-only query", async () => {
    const { db, schema } = m;
    const { eq, and, isNull } = await import("drizzle-orm");
    const [forum] = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.communityId, communityId),
          eq(schema.spaces.builtinSurface, "forum"),
        ),
      );
    await db
      .update(schema.spaces)
      .set({ archivedAt: new Date() })
      .where(eq(schema.spaces.id, forum!.id));
    const enabled = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.communityId, communityId),
          isNull(schema.spaces.archivedAt),
        ),
      );
    expect(enabled).toHaveLength(4);
  });
});
