import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  try {
    const text = readFileSync(".env", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch {}
}

async function main() {
  loadEnv();
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT id, prompt_id, model_provider, model_id, extraction_status, captured_at
    FROM "app"."benchmark_run"
    WHERE extraction_status IN ('pending', 'processing')
    ORDER BY captured_at DESC
    LIMIT 20
  `) as Array<Record<string, unknown>>;
  console.log(`Pending/processing runs: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `  ${r.extraction_status}  ${r.id}  ${r.model_provider}/${r.model_id}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
