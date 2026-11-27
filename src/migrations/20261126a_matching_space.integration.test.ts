// @vitest-environment node
// DB integration for migration 20261126a, called exactly like the deploy
// runner (`{ db }` only). Every case runs inside a transaction that is
// rolled back, so other suites' rows and the schema are left as found.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261126a_matching_space";

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
  surface: string | null;
  name: string | null;
  position: number;
  hidden: boolean;
};

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261126a matching space [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;

    beforeAll(async () => {
      const [dbMod, drizzle, mod] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261126a_matching_space"),
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

    async function community(tx: Tx): Promise<string> {
      const owner = uid("it-matching-user");
      const id = uid("it-matching-community");
      await tx.execute(sql`
        INSERT INTO "app"."user" ("id", "email") VALUES (${owner}, ${`${owner}@example.com`})`);
      await tx.execute(sql`
        INSERT INTO "app"."community" ("id", "name", "slug", "created_by")
        VALUES (${id}, ${id}, ${id}, ${owner})`);
      return id;
    }

    async function space(
      tx: Tx,
      communityId: string,
      slug: string,
      position: number,
      opts: {
        kind?: "builtin" | "room";
        surface?: string;
        hidden?: boolean;
      } = {},
    ) {
      const kind = opts.kind ?? "builtin";
      const surface = kind === "builtin" ? (opts.surface ?? slug) : null;
      await tx.execute(sql`
        INSERT INTO "app"."space"
          ("id", "community_id", "kind", "builtin_surface", "slug", "position", "archived_at")
        VALUES (gen_random_uuid()::text, ${communityId}, ${kind}, ${surface},
          ${slug}, ${position}, ${opts.hidden ? sql`now()` : null})`);
    }

    async function connectionType(
      tx: Tx,
      communityId: string,
      opts: { archived?: boolean } = {},
    ) {
      await tx.execute(sql`
        INSERT INTO "app"."community_connection_type"
          ("id", "community_id", "name", "mode", "prompt_a", "active")
        VALUES (gen_random_uuid()::text, ${communityId}, 'Mentor',
          'shared', 'What do you want to learn?', ${!opts.archived})`);
    }

    async function spacesOf(tx: Tx, communityId: string): Promise<SpaceRow[]> {
      const res = await tx.execute(sql`
        SELECT "slug", "kind", "builtin_surface" AS "surface", "name", "position",
          ("archived_at" IS NOT NULL) AS "hidden"
        FROM "app"."space" WHERE "community_id" = ${communityId}
        ORDER BY "position", "slug"`);
      return res.rows as SpaceRow[];
    }

    it("adds match after the last space for a community with an active connection type", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c, "forum", 0);
        await space(tx, c, "members", 1);
        await space(tx, c, "lounge-abc123", 4, { kind: "room" });
        // One active type is enough, next to an archived one.
        await connectionType(tx, c);
        await connectionType(tx, c, { archived: true });

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c)).toEqual([
          {
            slug: "forum",
            kind: "builtin",
            surface: "forum",
            name: null,
            position: 0,
            hidden: false,
          },
          {
            slug: "members",
            kind: "builtin",
            surface: "members",
            name: null,
            position: 1,
            hidden: false,
          },
          {
            slug: "lounge-abc123",
            kind: "room",
            surface: null,
            name: null,
            position: 4,
            hidden: false,
          },
          {
            slug: "match",
            kind: "builtin",
            surface: "matching",
            name: null,
            position: 5,
            hidden: false,
          },
        ]);
      });
    });

    it("adds match at position 0 for a community with no spaces yet", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await connectionType(tx, c);

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c)).toEqual([
          {
            slug: "match",
            kind: "builtin",
            surface: "matching",
            name: null,
            position: 0,
            hidden: false,
          },
        ]);
      });
    });

    it("leaves communities without connection types alone", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c, "forum", 0);
        const before = await spacesOf(tx, c);

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c)).toEqual(before);
      });
    });

    it("leaves communities whose connection types are all archived alone", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c, "forum", 0);
        await connectionType(tx, c, { archived: true });
        await connectionType(tx, c, { archived: true });
        const before = await spacesOf(tx, c);

        await migration.up({ db: tx } as never);

        // Matching is off there: the menu must not open an empty page.
        expect(await spacesOf(tx, c)).toEqual(before);
      });
    });

    it("skips a community whose slug match is already taken", async () => {
      await inRollback(async (tx) => {
        const byRoom = await community(tx);
        await space(tx, byRoom, "forum", 0);
        await space(tx, byRoom, "match", 1, { kind: "room" });
        await connectionType(tx, byRoom);
        // An owner already saved a type (or an earlier run) and hid the tab.
        const bySave = await community(tx);
        await space(tx, bySave, "forum", 0);
        await space(tx, bySave, "match", 3, {
          surface: "matching",
          hidden: true,
        });
        await connectionType(tx, bySave);
        const roomBefore = await spacesOf(tx, byRoom);
        const saveBefore = await spacesOf(tx, bySave);

        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, byRoom)).toEqual(roomBefore);
        expect(await spacesOf(tx, bySave)).toEqual(saveBefore);
      });
    });

    it("re-running adds nothing", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c, "forum", 0);
        await connectionType(tx, c);

        await migration.up({ db: tx } as never);
        const once = await spacesOf(tx, c);
        // A failed deploy re-runs it.
        await migration.up({ db: tx } as never);

        expect(await spacesOf(tx, c)).toEqual(once);
        expect(once.filter((r) => r.slug === "match")).toHaveLength(1);
      });
    });

    it("down removes only matching rows", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx);
        await space(tx, c, "forum", 0);
        await connectionType(tx, c);
        const other = await community(tx);
        await space(tx, other, "match", 0, { kind: "room" });

        await migration.up({ db: tx } as never);
        expect((await spacesOf(tx, c)).map((r) => r.slug)).toEqual([
          "forum",
          "match",
        ]);
        await migration.down({ db: tx } as never);

        expect((await spacesOf(tx, c)).map((r) => r.slug)).toEqual(["forum"]);
        expect((await spacesOf(tx, other)).map((r) => r.slug)).toEqual([
          "match",
        ]);
      });
    });
  },
);
