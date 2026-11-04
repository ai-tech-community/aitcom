import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NAME = "20261103a_datacenter_facility_planned_capacity";

describe("datacenter facility planned capacity migration", () => {
  const source = readFileSync(
    join(process.cwd(), `src/migrations/${NAME}.ts`),
    "utf8",
  );

  it("adds the editor columns and does not rewrite facility rows", () => {
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "capacity_mw_planned" numeric',
    );
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "ai_dedicated" boolean DEFAULT false',
    );
    expect(source).toContain('"datacenter_facilities"');
    expect(source).not.toContain('"app"."datacenter"');
    expect(source).not.toMatch(/\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE\s+"/);
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain(`name: "${NAME}"`);
  });
});
