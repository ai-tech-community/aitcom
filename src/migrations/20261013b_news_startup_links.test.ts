import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "20261013b_news_startup_links.ts"),
  "utf8",
);

describe("20261013b_news_startup_links", () => {
  it("only creates the join tables, so deploy can re-run it", () => {
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "app"."news_item_startup"',
    );
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "app"."news_rumor_startup"',
    );
    expect(source).toContain("CREATE INDEX IF NOT EXISTS");
    expect(source).not.toMatch(/\bSELECT\b/);
    expect(source).not.toMatch(/\bINSERT\b/);
    expect(source).not.toContain("matchIndexedNewsStartups");
    expect(source).not.toContain("matchNewsStartups");
  });
});
