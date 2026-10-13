/**
 * Apply any migrations not yet recorded in `payload_migrations`, then record
 * them — without the destructive `payload migrate` dev-mode prompt.
 *
 * Local:  pnpm db:apply / pnpm db:apply --dry-run
 * Deploy: scripts/db-apply-on-deploy.ts (Vercel `pnpm build` when VERCEL=1)
 *
 * It ONLY runs the `up()` of *unrecorded* migrations (already-applied ones,
 * including `20260831a_hub_dm_mail` after the #254 leftover, are never re-run).
 * Repo migrations are additive (CREATE/ALTER ... IF NOT EXISTS), so this is
 * idempotent and non-destructive.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";

import { migrations } from "@/migrations";
import {
  applyPendingMigrations,
  formatApplyPendingLog,
  type ApplyPendingStore,
} from "../src/server/db/apply-pending-migrations";

neonConfig.webSocketConstructor = ws;

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });

try {
  // One connection for the whole apply. A session advisory lock checked out
  // from the pool was left behind when the startup-link backfill timed out:
  // the unlock ran on a different connection. A transaction lock dies with
  // the transaction, including when the build process is killed.
  // The key is not `aitcom.db-apply-pending`: that session lock is still
  // held by the idle connection from the failed production build.
  const client = await pool.connect();
  const db = drizzle(client);
  const listed = migrations.map((migration) => ({
    name: migration.name,
    up: async () => {
      await migration.up({
        db,
      } as unknown as Parameters<typeof migration.up>[0]);
    },
  }));
  const store: ApplyPendingStore = {
    async listApplied() {
      const appliedRes = await db.execute(
        sql.raw(`select name, batch from payload_migrations`),
      );
      return appliedRes.rows.map((row) => ({
        name: String((row as { name: string }).name),
        batch: (row as { batch: string | number | null }).batch,
      }));
    },
    async runUp(migration) {
      console.log(`  applying ${migration.name} ...`);
      await migration.up(undefined);
    },
    async record(name, batch) {
      await db.execute(sql`
        insert into payload_migrations (name, batch, created_at, updated_at)
        select ${name}, ${batch}, now(), now()
        where not exists (
          select 1 from payload_migrations where name = ${name}
        )
      `);
    },
  };
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('aitcom.db-apply-pending.xact'))",
    );
    try {
      const result = await applyPendingMigrations(listed, store, { dryRun });

      if (result.status === "applied" || result.status === "dry-run") {
        console.log(
          `${result.pending.length} pending migration(s):`,
          result.pending,
        );
      }
      console.log(formatApplyPendingLog(result));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
