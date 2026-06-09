/**
 * Apply any migrations not yet recorded in `payload_migrations`, then record
 * them — without the destructive `payload migrate` dev-mode prompt.
 *
 * Use this for local dev DBs that were partly built via push, where
 * `payload migrate` refuses to run cleanly. It ONLY runs the `up()` of
 * *unrecorded* migrations (so already-applied ones are never re-run) and the
 * repo's migrations are additive (CREATE/ALTER ... IF NOT EXISTS), so this is
 * idempotent and non-destructive. Production keeps using `payload migrate`.
 *
 * Run with:  tsx --env-file=.env scripts/db-apply-pending.ts
 *            tsx --env-file=.env scripts/db-apply-pending.ts --dry-run
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";

import { migrations } from "@/migrations";

neonConfig.webSocketConstructor = ws;

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });
const db = drizzle(pool);

try {
  const appliedRes = await db.execute(
    sql.raw(`select name, batch from payload_migrations`),
  );
  const applied = new Set(
    appliedRes.rows.map((r) => (r as { name: string }).name),
  );
  const maxBatch = appliedRes.rows.reduce(
    (m, r) => Math.max(m, Number((r as { batch: string }).batch) || 0),
    0,
  );

  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    console.log("Up to date — no pending migrations.");
  } else {
    console.log(
      `${pending.length} pending migration(s):`,
      pending.map((m) => m.name),
    );
    if (dryRun) {
      console.log("--dry-run: not applying.");
    } else {
      const batch = String(maxBatch + 1);
      for (const m of pending) {
        console.log(`  applying ${m.name} ...`);
        await m.up({ db } as unknown as Parameters<typeof m.up>[0]);
        await db.execute(
          sql.raw(
            `insert into payload_migrations (name, batch, created_at, updated_at)
             select '${m.name}', '${batch}', now(), now()
             where not exists (select 1 from payload_migrations where name = '${m.name}')`,
          ),
        );
      }
      console.log(
        `Applied + recorded ${pending.length} migration(s) as batch ${batch}.`,
      );
    }
  }
} finally {
  await pool.end();
}
