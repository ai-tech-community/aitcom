import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function loadEnv() {
  const pattern = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i;
  try {
    const text = readFileSync(".env", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = pattern.exec(line);
      if (!m) continue;
      let val = m[2] ?? "";
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[m[1]!] ??= val;
    }
  } catch {
    /* no .env */
  }
}

type Row = {
  id: string;
  prompt_id: string;
  model_provider: string;
  model_id: string;
  extraction_status: string;
  captured_at: string;
};

async function main() {
  loadEnv();
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT id, prompt_id, model_provider, model_id, extraction_status, captured_at
    FROM "app"."benchmark_run"
    WHERE extraction_status IN ('pending', 'processing')
    ORDER BY captured_at DESC
    LIMIT 20
  `) as Row[];
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
