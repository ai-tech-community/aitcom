// @vitest-environment node
// DB integration for showOffersSpaceOnFirstPublish. Every case runs inside a
// transaction that is rolled back. Auto-skips unless RUN_DB_TESTS=1 and a
// local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as OffersSpace from "./offers-space";

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

describe.skipIf(!isLocalDbConfigured())(
  "showOffersSpaceOnFirstPublish [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let mod: typeof OffersSpace;

    beforeAll(async () => {
      const [dbMod, drizzle, m] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./offers-space"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      mod = m;
    }, 120_000);

    const rollback = new Error("rollback offers space exercise");

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

    async function community(
      tx: Tx,
      offersTab: "hidden" | "shown" | "none",
    ): Promise<{ id: string; owner: string }> {
      const owner = uid("it-offers-space-user");
      const id = uid("it-offers-space-community");
      await tx.execute(sql`
        INSERT INTO "app"."user" ("id", "email") VALUES (${owner}, ${`${owner}@example.com`})`);
      await tx.execute(sql`
        INSERT INTO "app"."community" ("id", "name", "slug", "created_by")
        VALUES (${id}, ${id}, ${id}, ${owner})`);
      if (offersTab !== "none") {
        await tx.execute(sql`
          INSERT INTO "app"."space"
            ("id", "community_id", "kind", "builtin_surface", "slug", "position", "archived_at")
          VALUES (gen_random_uuid()::text, ${id}, 'builtin', 'offers', 'offers', 0,
            ${offersTab === "hidden" ? sql`now()` : null})`);
      }
      return { id, owner };
    }

    async function offer(
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

    async function offersTabHidden(tx: Tx, communityId: string) {
      const res = await tx.execute(sql`
        SELECT ("archived_at" IS NOT NULL) AS "hidden" FROM "app"."space"
        WHERE "community_id" = ${communityId} AND "slug" = 'offers'`);
      return (res.rows as { hidden: boolean }[]).map((r) => r.hidden);
    }

    it("shows a hidden Offers tab when nothing is published yet", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx, "hidden");
        await offer(tx, c, false);

        expect(await mod.showOffersSpaceOnFirstPublish(tx, c.id)).toBe(true);
        expect(await offersTabHidden(tx, c.id)).toEqual([false]);
      });
    });

    it("leaves a hidden tab hidden when an offer is already published", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx, "hidden");
        await offer(tx, c, true);

        expect(await mod.showOffersSpaceOnFirstPublish(tx, c.id)).toBe(false);
        expect(await offersTabHidden(tx, c.id)).toEqual([true]);
      });
    });

    it("does nothing when the community has no offers row", async () => {
      await inRollback(async (tx) => {
        const c = await community(tx, "none");

        expect(await mod.showOffersSpaceOnFirstPublish(tx, c.id)).toBe(false);
        expect(await offersTabHidden(tx, c.id)).toEqual([]);
      });
    });

    it("only touches the given community", async () => {
      await inRollback(async (tx) => {
        const a = await community(tx, "hidden");
        const b = await community(tx, "hidden");

        expect(await mod.showOffersSpaceOnFirstPublish(tx, a.id)).toBe(true);
        expect(await offersTabHidden(tx, a.id)).toEqual([false]);
        expect(await offersTabHidden(tx, b.id)).toEqual([true]);
      });
    });
  },
);
