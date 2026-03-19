import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

export async function up(db: NeonHttpDatabase): Promise<void> {
  await db.execute(
    sql`ALTER TABLE app.benchmark_run ADD COLUMN IF NOT EXISTS model_id TEXT;`
  );
}
