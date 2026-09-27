import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("classroom upload policy migration", () => {
  it("adds the column with the owners-and-admins default, idempotently", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "src/migrations/20260928c_classroom_upload_policy.ts",
      ),
      "utf8",
    );
    for (const needle of [
      'ALTER TABLE "app"."community"',
      `ADD COLUMN IF NOT EXISTS "classroom_upload_policy" varchar(30) DEFAULT 'admins_only' NOT NULL`,
      'DROP COLUMN IF EXISTS "classroom_upload_policy"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20260928c_classroom_upload_policy"');
  });
});
