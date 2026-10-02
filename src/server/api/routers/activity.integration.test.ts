// @vitest-environment node
/**
 * DB-INTEGRATION test: `activity.getFeed` returns only the viewer's own
 * activity rows, never another actor's, whatever the client sends.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/api/routers/activity.integration.test.ts
 */
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

describe.skipIf(!RUN_DB)("activity.getFeed [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    inArray: typeof import("drizzle-orm").inArray;
  };
  let m: Mods;
  let fx: { me: string; other: string };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, { createCaller }, drizzle] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("drizzle-orm"),
    ]);
    m = { db, schema, createCaller, inArray: drizzle.inArray };
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    fx = { me: `act-me-${suffix}`, other: `act-other-${suffix}` };
    await m.db.insert(m.schema.user).values([
      { id: fx.me, email: `${fx.me}@example.test`, name: "Me" },
      { id: fx.other, email: `${fx.other}@example.test`, name: "Other" },
    ]);
    await m.db.insert(m.schema.activityEvents).values([
      { actorId: fx.me, actorType: "member", action: "thread.create" },
      {
        actorId: fx.other,
        actorType: "member",
        action: "message.sent",
        targetId: `conv-${suffix}`,
      },
    ]);
  });

  afterEach(async () => {
    const ids = [fx.me, fx.other];
    await m.db
      .delete(m.schema.activityEvents)
      .where(m.inArray(m.schema.activityEvents.actorId, ids));
    await m.db.delete(m.schema.user).where(m.inArray(m.schema.user.id, ids));
  });

  function caller() {
    return m.createCaller({
      db: m.db,
      session: { user: { id: fx.me, name: "Me" } } as never,
      headers: new Headers(),
    });
  }

  it("returns only the viewer's own rows", async () => {
    const { items } = await caller().activity.getFeed({ limit: 50 });

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.actorId === fx.me)).toBe(true);
  });

  it("ignores a stale client still asking for the old community scope", async () => {
    const { items } = await caller().activity.getFeed({
      limit: 50,
      mode: "community",
    } as never);

    expect(items.some((i) => i.actorId === fx.other)).toBe(false);
    expect(items.every((i) => i.actorId === fx.me)).toBe(true);
  });
});
