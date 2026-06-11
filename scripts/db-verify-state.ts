/**
 * Read-only verification that the DB matches the migration registry and that
 * this branch's critical schema objects + data invariants are in place.
 * Payload tables live in `public`; drizzle app tables live in the `app` schema.
 *
 * Run with:  tsx --env-file=.env scripts/db-verify-state.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";

import { migrations } from "@/migrations";

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });
const db = drizzle(pool);
const rows = async (q: string) => (await db.execute(sql.raw(q))).rows;

try {
  const appliedRes = (await rows(
    `SELECT name FROM payload_migrations ORDER BY id`,
  )) as { name: string }[];
  const applied = new Set(appliedRes.map((r) => r.name));
  const registered = migrations.map((m) => m.name);

  const missing = registered.filter((n) => !applied.has(n));
  // "dev" is Payload's dev-mode marker row, not a migration.
  const unknown = [...applied].filter(
    (n) => n !== "dev" && !registered.includes(n),
  );
  console.log(`registered: ${registered.length}, applied: ${applied.size}`);
  console.log(
    `missing from DB: ${missing.length ? missing.join(", ") : "none"}`,
  );
  console.log(
    `in DB but not in registry: ${unknown.length ? unknown.join(", ") : "none"}`,
  );

  console.log("\n--- schema spot-checks ---");
  const checks: [string, string][] = [
    [
      "modules table (public)",
      `SELECT (to_regclass('public.modules') IS NOT NULL) AS ok`,
    ],
    [
      "lessons.module column",
      `SELECT count(*) > 0 AS ok FROM information_schema.columns WHERE table_name='lessons' AND column_name='module'`,
    ],
    [
      "locked_docs_rels.modules_id",
      `SELECT count(*) > 0 AS ok FROM information_schema.columns WHERE table_name='payload_locked_documents_rels' AND column_name='modules_id'`,
    ],
    [
      "events.challenge_id",
      `SELECT count(*) > 0 AS ok FROM information_schema.columns WHERE table_name='events' AND table_schema='public' AND column_name='challenge_id'`,
    ],
    [
      "challenges_cell_template table",
      `SELECT (to_regclass('public.challenges_cell_template') IS NOT NULL) AS ok`,
    ],
    [
      "app.team_activity_event table",
      `SELECT (to_regclass('app.team_activity_event') IS NOT NULL) AS ok`,
    ],
    [
      "app.work_cell.claimed_by_user_id",
      `SELECT count(*) > 0 AS ok FROM information_schema.columns WHERE table_schema='app' AND table_name='work_cell' AND column_name='claimed_by_user_id'`,
    ],
    [
      "app.work_cell_result UNIQUE(cell_id)",
      `SELECT count(*) > 0 AS ok FROM pg_indexes WHERE schemaname='app' AND tablename='work_cell_result' AND indexdef ILIKE '%UNIQUE%' AND indexdef LIKE '%(cell_id)%'`,
    ],
  ];
  let fail = 0;
  for (const [label, q] of checks) {
    const [r] = (await rows(q)) as { ok: boolean }[];
    if (!r?.ok) fail++;
    console.log(`${r?.ok ? "OK  " : "FAIL"} ${label}`);
  }

  console.log("\n--- data integrity ---");
  const [dup] = (await rows(
    `SELECT count(*) AS n FROM (SELECT cell_id FROM app.work_cell_result GROUP BY cell_id HAVING count(*) > 1) d`,
  )) as { n: string }[];
  console.log(`duplicate work_cell_result rows per cell: ${dup.n}`);
  const [mixed] = (await rows(
    `SELECT count(*) AS n FROM lessons l WHERE l.module IS NULL AND EXISTS (SELECT 1 FROM modules m WHERE m.course = l.course)`,
  )) as { n: string }[];
  console.log(
    `mixed-course lessons (null module in moduled course): ${mixed.n}`,
  );
  const [xor] = (await rows(
    `SELECT count(*) AS n FROM app.work_cell WHERE claimed_by IS NOT NULL AND claimed_by_user_id IS NOT NULL`,
  )) as { n: string }[];
  console.log(`work_cell rows claimed by both agent and user: ${xor.n}`);

  console.log("\n--- row counts (key tables) ---");
  const tables: [string, string][] = [
    ["public", "courses"],
    ["public", "lessons"],
    ["public", "modules"],
    ["public", "challenges"],
    ["public", "events"],
    ["app", "team"],
    ["app", "work_grid"],
    ["app", "work_cell"],
    ["app", "work_cell_result"],
    ["app", "team_activity_event"],
  ];
  for (const [schema, t] of tables) {
    const [r] = (await rows(
      `SELECT count(*) AS n FROM "${schema}"."${t}"`,
    )) as { n: string }[];
    console.log(`${schema}.${t}: ${r.n}`);
  }

  if (fail > 0 || missing.length > 0 || unknown.length > 0) {
    console.log("\nRESULT: ISSUES FOUND");
    process.exitCode = 1;
  } else {
    console.log("\nRESULT: ALL CHECKS PASSED");
  }
} finally {
  await pool.end();
}
