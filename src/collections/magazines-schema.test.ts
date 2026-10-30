import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ISSUE_LAYOUTS,
  ISSUE_STATUSES,
  ISSUE_VISIBILITIES,
  MAX_MAGAZINE_TOPICS,
  PUBLISH_ORIGINS,
  SCHEDULE_ORIGINS,
} from "@/lib/magazines/values";

import type { Magazine } from "@/payload-types";

import { Articles } from "./Articles";
import { MagazineIssues } from "./MagazineIssues";
import { Magazines, stampListingHidden } from "./Magazines";

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
      "logoMediaId",
      "logoAlt",
      "coverMediaId",
      "coverImageUrl",
      "coverAlt",
      "font",
      "topics",
      "defaultVisibility",
      "publicConfirmedBy",
      "publicConfirmedAt",
      "createdBy",
      "listingHidden",
      "listingHiddenAt",
      "listingHiddenBy",
    ]);
    expect(pick(Magazines.fields, "communityId").unique).toBe(true);
    expect(pick(Magazines.fields, "slug").unique).toBe(true);
    expect(pick(Magazines.fields, "topics").maxRows).toBe(MAX_MAGAZINE_TOPICS);
    const visibility = pick(Magazines.fields, "defaultVisibility");
    expect(visibility.options!.map((o) => o.value)).toEqual([
      ...ISSUE_VISIBILITIES,
    ]);
    expect(visibility.defaultValue).toBe("members");
    expect(pick(Magazines.fields, "font")).toMatchObject({
      type: "select",
      defaultValue: "italiana",
      options: [
        { value: "italiana", label: "Italiana" },
        { value: "bodoni", label: "Bodoni Moda" },
        { value: "cormorant", label: "Cormorant Garamond" },
        { value: "geist", label: "Geist Sans" },
      ],
    });
  });
  it("has the staff switch fields", () => {
    expect(pick(Magazines.fields, "listingHidden")).toMatchObject({
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "Hide this magazine from the Magazines page and from search engines. Its pages still open by link.",
      },
    });
    expect(pick(Magazines.fields, "listingHiddenAt")).toMatchObject({
      type: "date",
      admin: { readOnly: true },
    });
    expect(pick(Magazines.fields, "listingHiddenBy")).toMatchObject({
      type: "text",
      admin: { readOnly: true, description: "Payload admin user who hid it" },
    });
    expect(Magazines.hooks?.beforeChange).toContain(stampListingHidden);
  });

  it("stamps who hid a magazine and clears it when shown again", async () => {
    const stamp = async (
      data: Partial<Magazine>,
      originalDoc: Partial<Magazine>,
      user: { id: number } | null = { id: 7 },
    ) =>
      stampListingHidden({
        data,
        originalDoc,
        req: { user },
      } as never) as Partial<Magazine>;
    const hidden = await stamp(
      { listingHidden: true },
      { listingHidden: false },
    );
    expect(hidden).toMatchObject({ listingHidden: true, listingHiddenBy: "7" });
    expect(new Date(hidden.listingHiddenAt!).toISOString()).toBe(
      hidden.listingHiddenAt,
    );
    expect(await stamp({ listingHidden: false }, hidden)).toEqual({
      listingHidden: false,
      listingHiddenAt: null,
      listingHiddenBy: null,
    });
    expect(await stamp({ name: "New name" }, hidden)).toEqual({
      name: "New name",
    });
    expect(await stamp({ listingHidden: true }, hidden)).toEqual({
      listingHidden: true,
    });
    expect(
      await stamp({ listingHidden: false }, { listingHidden: null }),
    ).toEqual({ listingHidden: false });
    expect(await stamp({ listingHidden: true }, {}, null)).toMatchObject({
      listingHiddenBy: null,
    });
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
    expect(status.options!.map((o) => o.value)).toContain("scheduled");
    expect(status.defaultValue).toBe("draft");
    expect(pick(MagazineIssues.fields, "scheduledFor")).toMatchObject({
      type: "date",
      index: true,
    });
    expect(pick(MagazineIssues.fields, "scheduledBy").type).toBe("text");
    const scheduledVia = pick(MagazineIssues.fields, "scheduledVia");
    expect(scheduledVia.type).toBe("select");
    expect(scheduledVia.options!.map((o) => o.value)).toEqual([
      ...SCHEDULE_ORIGINS,
    ]);
    const publishedVia = pick(MagazineIssues.fields, "publishedVia");
    expect(publishedVia.type).toBe("select");
    expect(publishedVia.options!.map((o) => o.value)).toEqual([
      ...PUBLISH_ORIGINS,
    ]);
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
      "launchpadProject",
    ]);
    for (const block of items.blocks!) {
      expect(block.fields[0]?.name).toBe("intro");
      expect(pick(block.fields, "image").type).toBe("json");
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
    expect(source).toContain(
      'CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_launchpad_project"',
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

describe("magazine subscriptions migration", () => {
  it("ships an idempotent migration registered after magazine staff", () => {
    const source = readFileSync(
      join(process.cwd(), "src/migrations/20261027b_magazine_subscriptions.ts"),
      "utf8",
    );
    for (const needle of [
      "ADD VALUE IF NOT EXISTS 'scheduled'",
      'CREATE TABLE IF NOT EXISTS "app"."magazine_subscription"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_issue_announcement"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_issue_delivery"',
    ]) {
      expect(source).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261027b_magazine_subscriptions"');
    expect(
      index.indexOf('name: "20261027b_magazine_subscriptions"'),
    ).toBeGreaterThan(index.indexOf('name: "20261027a_magazine_staff"'));
  });
});

describe("magazine auto-draft migration", () => {
  it("ships an idempotent migration registered after subscriptions", () => {
    const source = readFileSync(
      join(process.cwd(), "src/migrations/20261027c_magazine_auto_draft.ts"),
      "utf8",
    );
    for (const needle of [
      "ADD VALUE IF NOT EXISTS 'auto'",
      '"scheduled_via"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_auto_draft_settings"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_auto_draft_run"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_auto_pick"',
      'CREATE TABLE IF NOT EXISTS "app"."magazine_issue_history"',
    ]) {
      expect(source).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20261027c_magazine_auto_draft"');
    expect(
      index.indexOf('name: "20261027c_magazine_auto_draft"'),
    ).toBeGreaterThan(
      index.indexOf('name: "20261027b_magazine_subscriptions"'),
    );
  });
});
