/**
 * Apply migrations to local Docker Postgres via wsproxy.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";

import { migrations } from "/Users/greg/coding-projects/aitcom/src/migrations";

neonConfig.webSocketConstructor = ws;

const proxy = process.env.NEON_LOCAL_PROXY;
if (proxy) {
  neonConfig.wsProxy = () => `${proxy}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

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
} finally {
  await pool.end();
}
