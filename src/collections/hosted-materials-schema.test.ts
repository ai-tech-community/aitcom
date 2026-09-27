import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MATERIAL_STATUSES,
  MATERIAL_VISIBILITIES,
} from "@/lib/classroom/material-rules";

import { HostedMaterials } from "./HostedMaterials";

type Field = {
  name?: string;
  required?: boolean;
  unique?: boolean;
  index?: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
};
const fields = HostedMaterials.fields as Field[];
const field = (name: string) => fields.find((f) => f.name === name)!;

describe("hosted-materials collection", () => {
  it("defines the slice-2 fields, in order", () => {
    expect(HostedMaterials.slug).toBe("hosted-materials");
    expect(fields.map((f) => f.name)).toEqual([
      "communityId",
      "course",
      "uploaderId",
      "kind",
      "status",
      "failureReason",
      "title",
      "visibility",
      "fileName",
      "extension",
      "contentType",
      "bytes",
      "storageKey",
      "uploadId",
    ]);
  });

  it("starts a file as uploading and members-only, from the shared value lists", () => {
    expect(field("status").defaultValue).toBe("uploading");
    expect(field("visibility").defaultValue).toBe("members");
    expect(field("status").options!.map((o) => o.value)).toEqual([
      ...MATERIAL_STATUSES,
    ]);
    expect(field("visibility").options).toEqual([
      { label: "Members only", value: "members" },
      { label: "Free preview", value: "preview" },
    ]);
    expect(field("visibility").options!.map((o) => o.value)).toEqual([
      ...MATERIAL_VISIBILITIES,
    ]);
  });

  it("keeps storage keys and upload ids unique, and indexes the lookups", () => {
    expect(field("storageKey").unique).toBe(true);
    expect(field("uploadId").unique).toBe(true);
    for (const name of ["communityId", "course", "uploaderId", "status"]) {
      expect(field(name).index).toBe(true);
    }
  });

  it("ships a migration with the table, enums, indexes and admin-lock column", () => {
    const sql = readFileSync(
      join(process.cwd(), "src/migrations/20260928d_hosted_materials.ts"),
      "utf8",
    );
    for (const needle of [
      `CREATE TYPE "public"."enum_hosted_materials_kind" AS ENUM('file')`,
      `CREATE TYPE "public"."enum_hosted_materials_status" AS ENUM('uploading', 'ready', 'failed')`,
      `CREATE TYPE "public"."enum_hosted_materials_visibility" AS ENUM('members', 'preview')`,
      'CREATE TABLE IF NOT EXISTS "hosted_materials"',
      '"course" numeric NOT NULL',
      '"bytes" numeric NOT NULL',
      'CREATE INDEX IF NOT EXISTS "hosted_materials_status_idx"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_storage_key_idx"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_upload_id_idx"',
      '"hosted_materials_id" integer REFERENCES "hosted_materials"("id") ON DELETE cascade',
      'DROP TABLE IF EXISTS "hosted_materials"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(
      join(process.cwd(), "src/migrations/index.ts"),
      "utf8",
    );
    expect(index).toContain('name: "20260928d_hosted_materials"');
  });
});
