import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TextFieldSingleValidation } from "payload";
import { describe, expect, it } from "vitest";

import { Events } from "./Events";
import { FeedPosts } from "./FeedPosts";

type Field = {
  name?: string;
  type?: string;
  unique?: boolean;
  index?: boolean;
  hasMany?: boolean;
  relationTo?: string;
  admin?: { readOnly?: boolean; description?: string };
  validate?: TextFieldSingleValidation;
  fields?: Field[];
  tabs?: Array<{ fields: Field[] }>;
};

/** Every named field, through tabs, rows and collapsibles. */
function namedFields(fields: unknown): Field[] {
  return (fields as Field[]).flatMap((field) => [
    ...(field.name ? [field] : []),
    ...(field.tabs ?? []).flatMap((tab) => namedFields(tab.fields)),
    ...(!field.name && field.fields ? namedFields(field.fields) : []),
  ]);
}

const pick = (fields: unknown, name: string) =>
  namedFields(fields).find((f) => f.name === name);

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Calls the content field's validator the way Payload does on a write. */
function validateContent(value: string, siblingData: Record<string, unknown>) {
  const content = pick(FeedPosts.fields, "content")!;
  return content.validate!(value, {
    siblingData,
    required: true,
    maxLength: 2000,
    req: { t: (key: string) => key, payload: { config: {} } },
  } as never);
}

describe("feed-posts gallery batch", () => {
  it("references one gallery batch, read-only and unique", () => {
    expect(pick(FeedPosts.fields, "galleryBatch")).toEqual({
      name: "galleryBatch",
      type: "relationship",
      relationTo: "gallery-batches",
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          "The upload batch this post announces. Its pictures and videos live in the community gallery.",
      },
    });
  });

  it("lets a post that announces a gallery batch go without words", () => {
    expect(validateContent("", { galleryBatch: 7 })).toBe(true);
    expect(validateContent("", { galleryBatch: { id: 7 } })).toBe(true);
  });

  it("still asks for words when the post carries nothing", () => {
    expect(validateContent("", { galleryBatch: null })).not.toBe(true);
    expect(validateContent("", {})).not.toBe(true);
  });
});

describe("events without the old gallery", () => {
  it("no longer has the admin-only gallery field", () => {
    expect(pick(Events.fields, "gallery")).toBeUndefined();
    expect(pick(Events.fields, "coverImage")).toBeDefined();
  });

  it("no longer renders the old gallery on the event page", () => {
    const page = read("src/app/[locale]/events/[slug]/page.tsx");
    expect(page).not.toMatch(/event\.gallery/);
    expect(page).not.toMatch(/sectionGallery/);
  });
});

describe("migration 20261113b_gallery_feed_posts", () => {
  const migration = () =>
    read("src/migrations/20261113b_gallery_feed_posts.ts");

  it("is registered after the gallery tables", () => {
    const index = read("src/migrations/index.ts");
    expect(index).toContain(
      'import * as migration_20261113b_gallery_feed_posts from "./20261113b_gallery_feed_posts";',
    );
    expect(index.indexOf('name: "20261113a_community_gallery"')).toBeLessThan(
      index.indexOf('name: "20261113b_gallery_feed_posts"'),
    );
  });

  it("adds the feed post link with Payload's names", () => {
    expect(migration()).toContain(
      'ADD COLUMN IF NOT EXISTS "gallery_batch_id" integer',
    );
    expect(migration()).toContain(
      '"feed_posts_gallery_batch_id_gallery_batches_id_fk"',
    );
    expect(migration()).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "feed_posts_gallery_batch_idx"/,
    );
  });

  it("refuses to drop a non-empty event gallery before dropping it", () => {
    const guard = migration().indexOf(
      "RAISE EXCEPTION 'events gallery not empty",
    );
    const drop = migration().indexOf('DROP COLUMN IF EXISTS "media_id"');
    expect(guard).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(guard);
    expect(migration()).toContain("'version.gallery'");
    expect(migration()).not.toContain("'version_gallery'");
  });
});
