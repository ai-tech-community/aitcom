// @vitest-environment node
// DB integration for migration 20260929a: the organizer backfill picks the
// right person, in order of evidence, and leaves external events alone.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20260929a_event_organizer";

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

describe.skipIf(!RUN_DB)(
  "migration 20260929a event organizer [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;
    const events: number[] = [];
    const challenges: number[] = [];
    const activityIds: string[] = [];
    const logs: string[] = [];

    // Called exactly like scripts/db-apply-pending.ts: `db` and nothing else.
    const run = async () => {
      const log = vi.spyOn(console, "log").mockImplementation((msg) => {
        logs.push(String(msg));
      });
      try {
        await up({ db } as never);
      } finally {
        log.mockRestore();
      }
    };

    beforeAll(async () => {
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20260929a_event_organizer"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
      await run(); // adds the column (idempotent) before rows are seeded
    }, 120_000);

    afterEach(async () => {
      if (activityIds.length) {
        await db.execute(
          sql`DELETE FROM "app"."activity_event" WHERE "id" IN ${activityIds}`,
        );
      }
      if (events.length) {
        await db.execute(sql`DELETE FROM "events" WHERE "id" IN ${events}`);
      }
      if (challenges.length) {
        await db.execute(
          sql`DELETE FROM "challenges" WHERE "id" IN ${challenges}`,
        );
      }
      events.length = 0;
      challenges.length = 0;
      activityIds.length = 0;
      logs.length = 0;
    });

    async function insertEvent(fields: {
      submittedBy?: string | null;
      sourceUrl?: string | null;
      challengeId?: string | null;
      organizerId?: string | null;
    }) {
      const res = await db.execute(sql`
        INSERT INTO "events" ("slug", "submitted_by", "source_url", "challenge_id", "organizer_id")
        VALUES (${`it-organizer-${Date.now()}-${Math.random()}`}, ${fields.submittedBy ?? null},
                ${fields.sourceUrl ?? null}, ${fields.challengeId ?? null}, ${fields.organizerId ?? null})
        RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      events.push(id);
      return id;
    }

    async function insertCreateActivity(eventId: number, actorId: string) {
      const id = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO "app"."activity_event" ("id", "actor_id", "actor_type", "action", "target_type", "target_id")
        VALUES (${id}, ${actorId}, 'member', 'event.create', 'event', ${String(eventId)})`);
      activityIds.push(id);
    }

    async function insertChallenge(creatorId: string) {
      const res = await db.execute(sql`
        INSERT INTO "challenges" ("title", "slug", "description", "type", "status", "difficulty", "published_by", "creator_id", "rewards_xp_reward")
        VALUES ('it organizer', ${`it-organizer-${Date.now()}-${Math.random()}`}, '{}'::jsonb,
                'open-ended', 'draft', 'beginner', 'member', ${creatorId}, 0)
        RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      challenges.push(id);
      return id;
    }

    async function organizerOf(id: number) {
      const res = await db.execute(
        sql`SELECT "organizer_id" FROM "events" WHERE "id" = ${id}`,
      );
      return (res.rows[0] as { organizer_id: string | null }).organizer_id;
    }

    it("uses the submitter first", async () => {
      const id = await insertEvent({ submittedBy: "member-1" });
      await insertCreateActivity(id, "admin-1");

      await run();

      expect(await organizerOf(id)).toBe("member-1");
    });

    it("then the admin who created it", async () => {
      const id = await insertEvent({});
      await insertCreateActivity(id, "admin-1");

      await run();

      expect(await organizerOf(id)).toBe("admin-1");
    });

    it("then the hackathon's challenge creator", async () => {
      const challengeId = await insertChallenge("creator-1");
      const id = await insertEvent({ challengeId: String(challengeId) });

      await run();

      expect(await organizerOf(id)).toBe("creator-1");
    });

    it("leaves an existing organizer alone", async () => {
      const id = await insertEvent({
        submittedBy: "member-1",
        organizerId: "chosen-1",
      });

      await run();

      expect(await organizerOf(id)).toBe("chosen-1");
    });

    it("leaves external events without an organizer", async () => {
      const id = await insertEvent({
        submittedBy: "member-1",
        sourceUrl: "https://lu.ma/abc",
      });
      await insertCreateActivity(id, "admin-1");

      await run();

      expect(await organizerOf(id)).toBeNull();
    });

    it("leaves a native event with no evidence unassigned and reports it", async () => {
      const id = await insertEvent({});

      await run();

      expect(await organizerOf(id)).toBeNull();
      expect(logs.at(-1)).toMatch(/still-unassigned-native=\d+/);
    });
  },
);
