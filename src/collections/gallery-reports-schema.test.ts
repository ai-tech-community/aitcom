import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GALLERY_REPORT_REASONS } from "@/lib/gallery-report-reasons";

import { GalleryReports } from "./GalleryReports";

type Field = {
  name?: string;
  type?: string;
  required?: boolean;
  index?: boolean;
  relationTo?: string;
  maxLength?: number;
  options?: Array<{ label: string; value: string }>;
  admin?: { readOnly?: boolean };
};
const fieldsOf = (fields: unknown) => fields as Field[];
const pick = (name: string) =>
  fieldsOf(GalleryReports.fields).find((f) => f.name === name)!;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const MIGRATION = "src/migrations/20261113c_gallery_reports.ts";

describe("gallery-reports collection", () => {
  it("defines the report fields in order, with timestamps", () => {
    expect(GalleryReports.slug).toBe("gallery-reports");
    expect(GalleryReports.timestamps).toBe(true);
    expect(fieldsOf(GalleryReports.fields).map((f) => f.name)).toEqual([
      "item",
      "reporterId",
      "reason",
      "note",
      "dismissedAt",
    ]);
  });

  it("points at a required, indexed gallery item", () => {
    expect(pick("item")).toMatchObject({
      type: "relationship",
      relationTo: "gallery-items",
      required: true,
      index: true,
    });
    expect(pick("reporterId")).toMatchObject({
      type: "text",
      required: true,
      index: true,
    });
  });

  it("takes its reasons from the gallery list, with admin labels", () => {
    const reason = pick("reason");
    expect(reason).toMatchObject({ type: "select", required: true });
    expect(reason.options).toEqual([
      { label: "Spam", value: "spam" },
      { label: "Inappropriate", value: "inappropriate" },
      { label: "Copyright", value: "copyright" },
      { label: "Other", value: "other" },
      { label: "This is me", value: "this_is_me" },
    ]);
    expect(reason.options!.map((o) => o.value)).toEqual([
      ...GALLERY_REPORT_REASONS,
    ]);
  });

  it("caps the note and keeps dismissedAt indexed and read-only", () => {
    expect(pick("note")).toMatchObject({ type: "text", maxLength: 500 });
    expect(pick("dismissedAt")).toMatchObject({ type: "date", index: true });
    expect(pick("dismissedAt").admin?.readOnly).toBe(true);
  });

  it("allows one report per reporter per item", () => {
    expect(GalleryReports.indexes).toEqual([
      { fields: ["item", "reporterId"], unique: true },
    ]);
  });

  it("is for signed-in Payload admins only", () => {
    for (const operation of ["read", "create", "update", "delete"] as const) {
      const access = GalleryReports.access?.[operation] as
        | ((args: never) => unknown)
        | undefined;
      expect(access, operation).toBeTypeOf("function");
      expect(access!({ req: { user: null } } as never), operation).toBe(false);
      expect(
        access!({ req: { user: { id: 1, role: "editor" } } } as never),
        operation,
      ).toBe(true);
    }
  });
});

describe("gallery-reports registration and migration", () => {
  it("registers the collection after the gallery items", () => {
    const config = read("src/payload.config.ts");
    expect(config).toContain(
      'import { GalleryReports } from "./collections/GalleryReports";',
    );
    expect(config).toMatch(/GalleryItems,\s*GalleryReports,/);
  });

  it("ships the table, enum, cascade, indexes and admin-lock column", () => {
    const sql = read(MIGRATION);
    for (const needle of [
      `CREATE TYPE "public"."enum_gallery_reports_reason" AS ENUM('spam', 'inappropriate', 'copyright', 'other', 'this_is_me')`,
      'CREATE TABLE IF NOT EXISTS "gallery_reports"',
      '"item_id" integer NOT NULL',
      '"reason" "enum_gallery_reports_reason" NOT NULL',
      '"gallery_reports_item_id_gallery_items_id_fk"',
      'REFERENCES "public"."gallery_items"("id")',
      "ON DELETE cascade",
      'CREATE UNIQUE INDEX IF NOT EXISTS "gallery_reports_item_reporter_idx"',
      '"gallery_reports_item_idx"',
      '"gallery_reports_reporter_id_idx"',
      '"gallery_reports_dismissed_at_idx"',
      '"gallery_reports_created_at_idx"',
      '"gallery_reports_updated_at_idx"',
      'ADD COLUMN IF NOT EXISTS "gallery_reports_id" integer REFERENCES "gallery_reports"("id") ON DELETE cascade',
      '"payload_locked_documents_rels_gallery_reports_id_idx"',
      'DROP COLUMN IF EXISTS "gallery_reports_id"',
      'DROP TABLE IF EXISTS "gallery_reports"',
      'DROP TYPE IF EXISTS "public"."enum_gallery_reports_reason"',
    ]) {
      expect(sql).toContain(needle);
    }
  });

  it("leaves the feed's report enum alone", () => {
    expect(read(MIGRATION)).not.toContain("enum_post_reports_reason");
  });

  it("is registered in the migration index", () => {
    expect(read("src/migrations/index.ts")).toContain(
      'name: "20261113c_gallery_reports"',
    );
  });
});
