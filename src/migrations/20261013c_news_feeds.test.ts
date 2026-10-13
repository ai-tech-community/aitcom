import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "20261013c_news_feeds.ts"), "utf8");

describe("20261013c_news_feeds", () => {
  it("only creates the feed table, so deploy can re-run it", () => {
    expect(source).toContain('CREATE TABLE IF NOT EXISTS "app"."news_feed"');
    expect(source).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(source).not.toMatch(/\bSELECT\b/);
    expect(source).not.toMatch(/\bINSERT\b/);
  });
});
