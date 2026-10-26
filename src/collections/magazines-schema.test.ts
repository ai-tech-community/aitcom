import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ISSUE_LAYOUTS,
  ISSUE_STATUSES,
  ISSUE_VISIBILITIES,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";

import { Articles } from "./Articles";
import { MagazineIssues } from "./MagazineIssues";
import { Magazines } from "./Magazines";

type Field = {
  name?: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  index?: boolean;
  localized?: boolean;
  maxRows?: number;
  relationTo?: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  blocks?: Array<{ slug: string; fields: Field[] }>;
  admin?: { readOnly?: boolean };
};
const fieldsOf = (fields: unknown) => fields as Field[];
const pick = (fields: unknown, name: string) =>
  fieldsOf(fields).find((f) => f.name === name)!;

describe("magazines collection", () => {
  it("defines the magazine fields in order, one magazine per community", () => {
    expect(Magazines.slug).toBe("magazines");
    expect(fieldsOf(Magazines.fields).map((f) => f.name)).toEqual([
      "name",
      "slug",
      "communityId",
      "description",
      "logoUrl",
      "topics",
      "defaultVisibility",
      "publicConfirmedBy",
      "publicConfirmedAt",
      "createdBy",
    ]);
    expect(pick(Magazines.fields, "communityId").unique).toBe(true);
    expect(pick(Magazines.fields, "slug").unique).toBe(true);
    expect(pick(Magazines.fields, "topics").maxRows).toBe(MAX_MAGAZINE_TOPICS);
    const visibility = pick(Magazines.fields, "defaultVisibility");
    expect(visibility.options!.map((o) => o.value)).toEqual([
      ...ISSUE_VISIBILITIES,
    ]);
    expect(visibility.defaultValue).toBe("members");
  });
});

describe("magazine-issues collection", () => {
  it("defines issue fields, compound uniqueness and localized text", () => {
    expect(MagazineIssues.slug).toBe("magazine-issues");
    expect(pick(MagazineIssues.fields, "title").localized).toBe(true);
    expect(pick(MagazineIssues.fields, "editorNote").localized).toBe(true);
    expect(MagazineIssues.indexes).toEqual([
      { fields: ["magazine", "slug"], unique: true },
      { fields: ["magazine", "number"], unique: true },
    ]);
    const status = pick(MagazineIssues.fields, "status");
    expect(status.options!.map((o) => o.value)).toEqual([...ISSUE_STATUSES]);
    expect(status.defaultValue).toBe("draft");
    expect(
      pick(MagazineIssues.fields, "layout").options!.map((o) => o.value),
    ).toEqual([...ISSUE_LAYOUTS]);
    const visibility = pick(MagazineIssues.fields, "visibility");
    expect(visibility.options!.map((o) => o.value)).toEqual([
      ...ISSUE_VISIBILITIES,
    ]);
    expect(visibility.defaultValue).toBe("members");
  });

  it("builds the items blocks from the registry blocks", () => {
    const items = pick(MagazineIssues.fields, "items");
    expect(items.type).toBe("blocks");
    expect(items.blocks!.map((b) => b.slug)).toEqual([
      "article",
      "editorial",
      "storyline",
      "newsItem",
      "event",
      "forumThread",
    ]);
    for (const block of items.blocks!) {
      expect(block.fields[0]?.name).toBe("intro");
    }
  });
});

describe("articles collection", () => {
  it("adds magazine and placement relations to articles", () => {
    const magazine = pick(Articles.fields, "magazine");
    expect(magazine.type).toBe("relationship");
    expect(magazine.relationTo).toBe("magazines");
    const placement = pick(Articles.fields, "magazineIssue");
    expect(placement.type).toBe("relationship");
    expect(placement.relationTo).toBe("magazine-issues");
    expect(placement.admin?.readOnly).toBe(true);
    // The exactly-once credit claim is not a Payload field: a save would
    // rewrite it from a stale version and a duplicate would copy it.
    expect(
      Articles.fields.some(
        (field) => "name" in field && field.name === "magazineCreditedAt",
      ),
    ).toBe(false);
  });
});

describe("magazines migration", () => {
  it("ships an idempotent migration registered in the index", () => {
    const sql = readFileSync(
      join(process.cwd(), "src/migrations/20261026a_magazines.ts"),
      "utf8",
    );
    for (const needle of [
      'CREATE TABLE IF NOT EXISTS "magazines"',
      'CREATE TABLE IF NOT EXISTS "magazine_issues"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "magazines_community_id_idx"',
      'ADD COLUMN IF NOT EXISTS "magazine_id"',
      'ADD COLUMN IF NOT EXISTS "version_magazine_id"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_article_credit"',
      'DROP TABLE IF EXISTS "app"."magazine_article_credit"',
      '"magazines_id" integer REFERENCES "magazines"("id") ON DELETE cascade',
      '"magazine_issues_id" integer REFERENCES "magazine_issues"("id") ON DELETE cascade',
      'DROP TABLE IF EXISTS "magazine_issues"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261026a_magazines"');
  });
});

describe("magazine platform items migration", () => {
  it("ships idempotent platform block migrations registered after magazines", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/migrations/20261026b_magazine_platform_items.ts",
      ),
      "utf8",
    );
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_storyline"',
    );
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_news_item"',
    );
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_event"',
    );
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_forum_thread"',
    );
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261026b_magazine_platform_items"');
    expect(
      index.indexOf('name: "20261026b_magazine_platform_items"'),
    ).toBeGreaterThan(index.indexOf('name: "20261026a_magazines"'));
  });
});
