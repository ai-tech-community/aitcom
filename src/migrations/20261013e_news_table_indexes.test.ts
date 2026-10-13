import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "20261013e_news_table_indexes.ts"),
  "utf8",
);

describe("20261013e_news_table_indexes", () => {
  it("only creates indexes, so deploy can re-run it inside the time limit", () => {
    expect(source).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(source).toContain("CREATE INDEX IF NOT EXISTS");
    expect(source).toContain("news_item_date_sort_idx");
    expect(source).toContain("news_item_title_lower_trgm");
    expect(source).toContain("news_rumor_visible_date_sort_idx");
    expect(source).toContain("news_rumor_submitter_norm_idx");
    expect(source).not.toMatch(/\bINSERT\b/);
    expect(source).not.toMatch(/\bUPDATE\b/);
    expect(source).not.toMatch(/\bDELETE\b/);
    expect(source).not.toMatch(/\bSELECT\b/);
  });
});
