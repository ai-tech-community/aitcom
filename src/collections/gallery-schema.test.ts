import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GALLERY_ALT_MAX,
  GALLERY_BATCH_TEXT_MAX,
  GALLERY_CAPTION_MAX,
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
} from "@/lib/gallery-rules";
import { VIDEO_VISIBILITIES } from "@/lib/video-rules";

import { GalleryBatches } from "./GalleryBatches";
import { GalleryItems } from "./GalleryItems";

type Field = {
  name?: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  index?: boolean;
  relationTo?: string;
  defaultValue?: unknown;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string }>;
};
const fieldsOf = (fields: unknown) => fields as Field[];
const pick = (fields: unknown, name: string) =>
  fieldsOf(fields).find((f) => f.name === name)!;
const values = (field: Field) => field.options!.map((o) => o.value);

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("gallery-items collection", () => {
  it("defines the item fields in order", () => {
    expect(GalleryItems.slug).toBe("gallery-items");
    expect(GalleryItems.timestamps).toBe(true);
    expect(fieldsOf(GalleryItems.fields).map((f) => f.name)).toEqual([
      "communityId",
      "event",
      "topicSlug",
      "mediaType",
      "status",
      "failureReason",
      "storage",
      "visibility",
      "fileKey",
      "thumbnailKey",
      "width",
      "height",
      "bytes",
      "durationSeconds",
      "caption",
      "alt",
      "uploaderId",
      "batch",
      "uploadId",
      "magazineConsent",
      "magazineConsentAt",
      "hiddenAt",
      "reportCount",
    ]);
  });

  it("keeps file keys and upload ids unique so one upload is one item", () => {
    expect(pick(GalleryItems.fields, "fileKey").unique).toBe(true);
    expect(pick(GalleryItems.fields, "uploadId").unique).toBe(true);
  });

  it("links an optional event and a required batch, both indexed", () => {
    expect(pick(GalleryItems.fields, "event")).toMatchObject({
      type: "relationship",
      relationTo: "events",
      index: true,
    });
    expect(pick(GalleryItems.fields, "event").required).toBeFalsy();
    expect(pick(GalleryItems.fields, "batch")).toMatchObject({
      type: "relationship",
      relationTo: "gallery-batches",
      required: true,
      index: true,
    });
  });

  it("indexes the columns the gallery filters and counts by", () => {
    for (const name of [
      "communityId",
      "topicSlug",
      "status",
      "uploaderId",
      "hiddenAt",
    ]) {
      expect(pick(GalleryItems.fields, name).index, name).toBe(true);
    }
  });

  it("uses the agreed select values and defaults", () => {
    const status = pick(GalleryItems.fields, "status");
    expect(values(status)).toEqual(["uploading", "ready", "failed"]);
    expect(status.defaultValue).toBe("uploading");
    expect(values(pick(GalleryItems.fields, "mediaType"))).toEqual([
      "photo",
      "video",
    ]);
    expect(values(pick(GalleryItems.fields, "storage"))).toEqual([
      "public",
      "private",
    ]);
    const visibility = pick(GalleryItems.fields, "visibility");
    expect(visibility.options).toEqual([
      { label: "Community only", value: "community" },
      { label: "Public", value: "public" },
    ]);
    expect(values(visibility)).toEqual([...VIDEO_VISIBILITIES]);
    expect(visibility.defaultValue).toBe("community");
    expect(pick(GalleryItems.fields, "magazineConsent")).toMatchObject({
      type: "checkbox",
      defaultValue: false,
    });
    expect(pick(GalleryItems.fields, "reportCount").defaultValue).toBe(0);
  });

  it("caps caption and alt text at the shared limits", () => {
    expect(pick(GalleryItems.fields, "caption").maxLength).toBe(
      GALLERY_CAPTION_MAX,
    );
    expect(pick(GalleryItems.fields, "alt").maxLength).toBe(GALLERY_ALT_MAX);
  });
});

describe("gallery-batches collection", () => {
  it("defines the batch fields in order", () => {
    expect(GalleryBatches.slug).toBe("gallery-batches");
    expect(GalleryBatches.timestamps).toBe(true);
    expect(fieldsOf(GalleryBatches.fields).map((f) => f.name)).toEqual([
      "communityId",
      "uploaderId",
      "event",
      "topicSlug",
      "visibility",
      "magazineConsent",
      "magazineConsentAt",
      "caption",
      "plannedFiles",
      "plannedVideos",
      "status",
      "feedPostId",
    ]);
  });

  it("uses the agreed select values, defaults and limits", () => {
    const status = pick(GalleryBatches.fields, "status");
    expect(values(status)).toEqual(["open", "finished"]);
    expect(status.defaultValue).toBe("open");
    expect(pick(GalleryBatches.fields, "visibility").defaultValue).toBe(
      "community",
    );
    expect(pick(GalleryBatches.fields, "magazineConsent")).toMatchObject({
      type: "checkbox",
      defaultValue: false,
    });
    expect(pick(GalleryBatches.fields, "event")).toMatchObject({
      type: "relationship",
      relationTo: "events",
      index: true,
    });
    expect(pick(GalleryBatches.fields, "caption").maxLength).toBe(
      GALLERY_BATCH_TEXT_MAX,
    );
    expect(pick(GalleryBatches.fields, "plannedFiles")).toMatchObject({
      required: true,
      min: 1,
      max: GALLERY_MAX_FILES_PER_BATCH,
    });
    expect(pick(GalleryBatches.fields, "plannedVideos")).toMatchObject({
      required: true,
      min: 0,
      max: GALLERY_MAX_VIDEOS_PER_BATCH,
    });
  });
});

describe("gallery collection access", () => {
  const operations = ["read", "create", "update", "delete"] as const;

  it.each([
    ["gallery-items", GalleryItems],
    ["gallery-batches", GalleryBatches],
  ] as const)(
    "%s is for signed-in Payload admins only",
    (_slug, collection) => {
      for (const operation of operations) {
        const access = collection.access?.[operation] as
          | ((args: never) => unknown)
          | undefined;
        expect(access, operation).toBeTypeOf("function");
        expect(access!({ req: { user: null } } as never), operation).toBe(
          false,
        );
        expect(
          access!({ req: { user: { id: 1, role: "editor" } } } as never),
          operation,
        ).toBe(true);
      }
    },
  );
});

describe("gallery registration and migration", () => {
  it("registers both collections in the Payload config", () => {
    const config = read("src/payload.config.ts");
    expect(config).toContain(
      'import { GalleryItems } from "./collections/GalleryItems";',
    );
    expect(config).toContain(
      'import { GalleryBatches } from "./collections/GalleryBatches";',
    );
    expect(config).toMatch(
      /HostedMaterials,\s*GalleryBatches,\s*GalleryItems,/,
    );
  });

  it("ships a migration with tables, enums, indexes and admin-lock columns", () => {
    const sql = read("src/migrations/20261113a_community_gallery.ts");
    for (const needle of [
      '"public"."enum_gallery_items_media_type"',
      '"public"."enum_gallery_items_status"',
      '"public"."enum_gallery_items_storage"',
      '"public"."enum_gallery_items_visibility"',
      '"public"."enum_gallery_batches_visibility"',
      '"public"."enum_gallery_batches_status"',
      'CREATE TABLE IF NOT EXISTS "gallery_batches"',
      'CREATE TABLE IF NOT EXISTS "gallery_items"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "gallery_items_file_key_idx"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "gallery_items_upload_id_idx"',
      '"gallery_items_event_idx"',
      '"gallery_items_batch_idx"',
      '"gallery_items_hidden_at_idx"',
      '"gallery_batches_status_idx"',
      '"gallery_batches_event_idx"',
      '"gallery_items_event_id_events_id_fk"',
      '"gallery_items_batch_id_gallery_batches_id_fk"',
      '"gallery_batches_event_id_events_id_fk"',
      '"payload_locked_documents_rels_gallery_items_id_idx"',
      '"payload_locked_documents_rels_gallery_batches_id_idx"',
      'DROP COLUMN IF EXISTS "gallery_items_id"',
      'DROP COLUMN IF EXISTS "gallery_batches_id"',
    ]) {
      expect(sql).toContain(needle);
    }
  });

  it("appends the Gallery tab to every community and removes only that tab on down", () => {
    const sql = read("src/migrations/20261113a_community_gallery.ts");
    expect(sql).toContain('INSERT INTO "app"."space"');
    expect(sql).toContain(
      'COALESCE((SELECT MAX(s."position") + 1 FROM "app"."space" s WHERE s."community_id" = c."id"), 0)',
    );
    expect(sql).toContain(
      `DELETE FROM "app"."space" WHERE "kind" = 'builtin' AND "builtin_surface" = 'gallery'`,
    );
    const index = read("src/migrations/index.ts");
    expect(index).toContain('name: "20261113a_community_gallery"');
  });
});
