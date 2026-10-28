import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("community banner migration", () => {
  it("adds a nullable banner column and does not rewrite rows", () => {
    const source = readFileSync(
      join(process.cwd(), "src/migrations/20261028d_community_banner.ts"),
      "utf8",
    );
    expect(source).toContain('ADD COLUMN IF NOT EXISTS "banner_url" text');
    expect(source).toContain('DROP COLUMN IF EXISTS "banner_url"');
    expect(source).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261028d_community_banner"');
  });
});
