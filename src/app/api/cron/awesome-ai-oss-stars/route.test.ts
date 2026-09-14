import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "route.ts"), "utf8");
const vercel = readFileSync(join(dir, "../../../../../vercel.json"), "utf8");
const migration = readFileSync(
  join(
    dir,
    "../../../../../src/migrations/20260914g_awesome_ai_oss_phase_3.ts",
  ),
  "utf8",
);

describe("awesome-ai-oss-stars cron", () => {
  it("is a daily soft-fail cron that never invents star_count", () => {
    expect(src).toContain("CRON_SECRET");
    expect(src).toContain("refreshStoredAwesomeStars");
    expect(src).toContain("status: 200");
    expect(vercel).toContain("/api/cron/awesome-ai-oss-stars");
    expect(vercel).toContain("20 7 * * *");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "star_count"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "stars_checked_at"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "sources"');
    expect(migration).toContain("AWESOME_AI_OSS_CURATED_SOURCES");
    expect(migration).not.toMatch(/star_count"\) VALUES/);
    expect(migration).not.toMatch(/★ 0/);
  });
});
