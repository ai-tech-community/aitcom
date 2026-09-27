/**
 * Fail when the database lacks a column Payload expects in a guarded table
 * (see GUARDED_PAYLOAD_TABLES). Read-only. Payload builds the expected
 * columns from the config itself, so this needs no copy of its naming rules.
 *
 * Deploy: scripts/db-apply-on-deploy.ts runs it after applying migrations.
 * Local:  tsx --env-file=.env scripts/db-verify-payload-schema.ts
 */
import { getPayload } from "payload";
import { sql } from "@payloadcms/db-postgres";

import config from "../src/payload.config";
import {
  findMissingColumns,
  GUARDED_PAYLOAD_TABLES,
} from "../src/server/db/payload-schema-drift";

type RawTable = { columns: Record<string, { name: string }> };

const payload = await getPayload({ config });

const db = payload.db as unknown as {
  rawTables: Record<string, RawTable>;
  drizzle: { execute: (q: unknown) => Promise<{ rows: unknown[] }> };
};

const expected = Object.fromEntries(
  GUARDED_PAYLOAD_TABLES.map((table) => {
    const raw = db.rawTables[table];
    if (!raw) throw new Error(`Payload has no table named ${table}`);
    return [table, Object.values(raw.columns).map((c) => c.name)];
  }),
);

const { rows } = await db.drizzle.execute(sql`
    SELECT table_name AS "table", column_name AS "column"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ${GUARDED_PAYLOAD_TABLES}
  `);

const missing = findMissingColumns(
  expected,
  rows as { table: string; column: string }[],
);
if (missing.length > 0) {
  console.error(
    `db-verify-payload-schema: missing column(s): ${missing.join(", ")}.\n` +
      "Add them in a migration (see src/migrations/20260927a_points_boosts_locked_docs_rels.ts).",
  );
  process.exitCode = 1;
} else {
  console.log(
    `db-verify-payload-schema: OK (${GUARDED_PAYLOAD_TABLES.join(", ")})`,
  );
}

// payload.destroy() does not return here; exit so the build continues.
process.exit(process.exitCode ?? 0);
