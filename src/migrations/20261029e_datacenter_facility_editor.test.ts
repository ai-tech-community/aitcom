import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("datacenter facility editor migration", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "src/migrations/20261029e_datacenter_facility_editor.ts",
    ),
    "utf8",
  );

  it("adds nullable source and checked-at columns and does not rewrite rows", () => {
    expect(source).toContain('ADD COLUMN IF NOT EXISTS "source_url" text');
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "checked_at" timestamptz',
    );
    expect(source).toContain("datacenter_source_url_https");
    expect(source).not.toMatch(/\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE\s+"/);
    expect(source).not.toContain('DROP TABLE IF EXISTS "app"."datacenter"');
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261029e_datacenter_facility_editor"');
  });
});
