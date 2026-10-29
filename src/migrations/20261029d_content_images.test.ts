import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("content image migration", () => {
  const source = readFileSync(
    join(process.cwd(), "src/migrations/20261029d_content_images.ts"),
    "utf8",
  );

  it("adds nullable image columns and does not rewrite rows", () => {
    expect(source).toContain('"image_media_id"');
    expect(source).toContain('"image_url"');
    expect(source).toContain('"image_alt"');
    expect(source).toContain('"banner_media_id"');
    expect(source).toContain('"banner_alt"');
    expect(source).toContain('"logo_media_id"');
    expect(source).toContain('"logo_alt"');
    expect(source).toContain('"cover_media_id"');
    expect(source).toContain('"cover_image_url"');
    expect(source).toContain('"cover_alt"');
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "image_media_id" numeric',
    );
    expect(source).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
    expect(source).not.toMatch(/"image" jsonb/);
    const modules = source.split('ALTER TABLE "modules"')[1]?.split("ALTER TABLE")[0] ?? "";
    expect(modules).toContain("image_url");
    expect(modules).not.toContain("cover_image_url");
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261029d_content_images"');
    expect(index.indexOf('name: "20261029b_magazine_item_images"')).toBeLessThan(
      index.indexOf('name: "20261029d_content_images"'),
    );
  });
});
