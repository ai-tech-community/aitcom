// @vitest-environment node
// DB integration for migration 20261114c, called exactly like the deploy
// runner (`{ db }` only). Every case runs inside a transaction that is
// rolled back, so other suites' rows and the schema are left as found.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261114c_offers_space";

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

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

type SpaceRow = {
  slug: string;
  kind: string;
  position: number;
  hidden: boolean;
};

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261114c offers space [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;

    beforeAll(async () => {
      const [dbMod, drizzle, mod] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261114c_offers_space"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      migration = mod;
    }, 120_000);

    const rollback = new Error("rollback migration exercise");

    /** Runs `body` in a transaction that is always rolled back. */
    async function inRollback(body: (tx: Tx) => Promise<void>) {
      await expect(
        db.transaction(async (tx) => {
          await body(tx);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    }

    function uid(prefix: string) {
      return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    async function community(tx: Tx): Promise<{ id: string; owner: string }> {
      const owner = uid("it-offers-user");
      const id = uid("it-offers-community");
      await tx.execute(sql`
        INSERT INTO "app"."user" ("id", "email") VALUES (${owner}, ${`${owner}@example.com`})`);
      await tx.execute(sql`
        INSERT INTO "app"."community" ("id", "name", "slug", "created_by")
        VALUES (${id}, ${id}, ${id}, ${owner})`);
      return { id, owner };
    }

    async function space(
      tx: Tx,
      communityId: string,
      slug: string,
      position: number,
      opts: { kind?: "builtin" | "room"; hidden?: boolean } = {},
    ) {
      const kind = opts.kind ?? "builtin";
      await tx.execute(sql`
        INSERT INTO "app"."space"
          ("id", "community_id", "kind", "builtin_surface", "slug", "position", "archived_at")
        VALUES (gen_random_uuid()::text, ${communityId}, ${kind},
          ${kind === "builtin" ? slug : null}, ${slug}, ${position},
          ${opts.hidden ? sql`now()` : null})`);
    }

    async function publishedOffer(
      tx: Tx,
      c: { id: string; owner: string },
      published: boolean,
    ) {
      const connection = await tx.execute(sql`
        INSERT INTO "app"."payment_connection"
          ("id", "community_id", "owner_id", "provider", "environment")
        VALUES (gen_random_uuid(), ${c.id}, ${c.owner}, 'stripe', 'test')
        RETURNING "id"`);
      const connectionId = (connection.rows[0] as { id: string }).id;
      await tx.execute(sql`
        INSERT INTO "app"."payment_offer"
          ("id", "community_id", "connection_id", "title", "kind", "amount", "interval", "published")
        VALUES (gen_random_uuid(), ${c.id}, ${connectionId}, 'Membership',
          'membership', 1000, 'month', ${published})`);
    }

    async function spacesOf(tx: Tx, communityId: string): Promise<SpaceRow[]> {
      const res = await tx.execute(sql`
        SELECT "slug", "kind", "position", ("archived_at" IS NOT NULL) AS "hidden"
        FROM "app"."space" WHERE "community_id" = ${communityId}
        ORDER BY "position", "slug"`);
      return res.rows as SpaceRow[];
    }

    it("adds Offers first and hidden for a community with no published offer", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c.id, "forum", 0);
        await space(tx, c.id, "members", 1);
        await publishedOffer(tx, c, false);

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c.id)).toEqual([
          { slug: "offers", kind: "builtin", position: 0, hidden: true },
          { slug: "forum", kind: "builtin", position: 1, hidden: false },
          { slug: "members", kind: "builtin", position: 2, hidden: false },
        ]);
      });
    });

    it("adds Offers shown for a community with a published offer", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c.id, "forum", 0);
        await publishedOffer(tx, c, true);

        await migration.up({ db: tx } as never);

        expect((await spacesOf(tx, c.id))[0]).toEqual({
          slug: "offers",
          kind: "builtin",
          position: 0,
          hidden: false,
        });
      });
    });

    it("keeps a hidden space hidden and the order of rooms", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c.id, "forum", 0);
        await space(tx, c.id, "gallery", 1, { hidden: true });
        await space(tx, c.id, "lounge-abc123", 4, { kind: "room" });

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c.id)).toEqual([
          { slug: "offers", kind: "builtin", position: 0, hidden: true },
          { slug: "forum", kind: "builtin", position: 1, hidden: false },
          { slug: "gallery", kind: "builtin", position: 2, hidden: true },
          { slug: "lounge-abc123", kind: "room", position: 5, hidden: false },
        ]);
      });
    });

    it("is idempotent", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c.id, "forum", 0);

        await migration.up({ db: tx } as never);
        const once = await spacesOf(tx, c.id);
        // A failed deploy re-runs it.
        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c.id)).toEqual(once);
        expect(once.filter((r) => r.slug === "offers")).toHaveLength(1);
      });
    });

    it("skips a community that already has an offers row", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c.id, "forum", 0);
        await space(tx, c.id, "offers", 3, { hidden: true });
        const before = await spacesOf(tx, c.id);

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c.id)).toEqual(before);
      });
    });

    it("down removes only builtin offers rows", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c.id, "forum", 0);
        await space(tx, c.id, "offers-room-x1", 2, { kind: "room" });

        await migration.up({ db: tx } as never);
        await migration.down({ db: tx } as never);

        expect((await spacesOf(tx, c.id)).map((r) => r.slug)).toEqual([
          "forum",
          "offers-room-x1",
        ]);
      });
    });
  },
);
