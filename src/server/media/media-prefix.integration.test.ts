// @vitest-environment node
/**
 * DB-INTEGRATION test: where Payload `media` files are written in S3. New
 * files go under a folder (`media`, or the caller's own), never the bucket
 * root; files stored before that rule keep their root prefix and URL.
 *
 * S3 is never called: every S3 command the storage adapter sends is caught
 * and recorded, so the test asserts on the object keys it would write.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     S3_BUCKET=local-test-bucket S3_ACCESS_KEY_ID=AKIAFAKELOCALONLY0000 \
 *     S3_SECRET_ACCESS_KEY=fake-local-only-secret \
 *     pnpm exec vitest run src/server/media/media-prefix.integration.test.ts
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Media } from "@/payload-types";
import { LEGACY_ROOT_EDIT_MESSAGE } from "@/server/media/media-prefix";
import type { db as Db } from "@/server/db";
import type { sql as Sql } from "drizzle-orm";
import type { Payload, PayloadRequest } from "payload";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

type S3Call = { command: string; key: string };
type MediaRow = {
  prefix: string | null;
  filename: string | null;
  url: string | null;
  focal_x: string | number | null;
  sizes_thumbnail_url: string | null;
  sizes_card_url: string | null;
  sizes_hero_url: string | null;
  sizes_feed_url: string | null;
};
const SIZES = ["thumbnail", "card", "hero", "feed"] as const;

describe.skipIf(!RUN_DB)("media storage prefix [DB integration]", () => {
  let payload: Payload;
  let db: typeof Db;
  let sql: typeof Sql;
  let png: Buffer;
  const calls: S3Call[] = [];
  const created: number[] = [];
  const sfx = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  let seq = 0;

  const base = () =>
    `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION ?? "eu-central-1"}.amazonaws.com`;
  const keysOf = (command: string) =>
    calls.filter((c) => c.command === command).map((c) => c.key);

  function file(label: string, name?: string) {
    seq += 1;
    return {
      data: png,
      mimetype: "image/png",
      name: name ?? `media-prefix-${label}-${sfx}-${seq}.png`,
      size: png.byteLength,
    };
  }

  async function create(
    data: Record<string, unknown>,
    label: string,
    options: { name?: string; overrideAccess?: boolean } = {},
  ) {
    const doc = await payload.create({
      collection: "media",
      data: { alt: "A test picture", ...data } as never,
      file: file(label, options.name),
      ...(options.overrideAccess === false
        ? {
            overrideAccess: false,
            user: { id: 1, collection: "users", email: "admin@example.test" },
          }
        : {}),
    } as never);
    created.push((doc as Media).id);
    return doc as Media;
  }

  async function row(id: number): Promise<MediaRow> {
    const res = await db.execute(
      sql`SELECT "prefix", "filename", "url", "focal_x",
        "sizes_thumbnail_url", "sizes_card_url", "sizes_hero_url", "sizes_feed_url"
        FROM "media" WHERE "id" = ${id}`,
    );
    return res.rows[0] as MediaRow;
  }

  /**
   * A doc as it was stored before the folder rule: prefix empty or null,
   * and every stored URL (original and all four sizes) at the bucket root.
   */
  async function oldRootDoc(prefix: "" | null, name?: string) {
    const doc = await create({}, "old", { name });
    const rootUrl = (filename?: string | null) => `${base()}/${filename}`;
    await db.execute(sql`
      UPDATE "media" SET
        "prefix" = ${prefix},
        "url" = ${rootUrl(doc.filename)},
        "sizes_thumbnail_url" = ${rootUrl(doc.sizes?.thumbnail?.filename)},
        "sizes_card_url" = ${rootUrl(doc.sizes?.card?.filename)},
        "sizes_hero_url" = ${rootUrl(doc.sizes?.hero?.filename)},
        "sizes_feed_url" = ${rootUrl(doc.sizes?.feed?.filename)}
      WHERE "id" = ${doc.id}
    `);
    calls.length = 0;
    return doc;
  }

  /**
   * Payload re-downloads the stored original for a crop or focal-point
   * edit. Answer that download locally with the test picture.
   */
  function serveStoredFiles() {
    const realFetch = globalThis.fetch;
    return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.startsWith(base())) return realFetch(input, init);
      return Promise.resolve(
        new Response(new Uint8Array(png), {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": String(png.byteLength),
          },
        }),
      );
    });
  }

  /**
   * A focal-point move as the admin sends it: the doc's file fields, and
   * the new point as `uploadEdits` in the query string.
   */
  function focalEdit(doc: Media) {
    return {
      collection: "media" as const,
      id: doc.id,
      data: { filename: doc.filename, url: doc.url },
      req: {
        query: { uploadEdits: { focalPoint: { x: 20, y: 30 } } },
      } as Partial<PayloadRequest>,
    };
  }

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ S3 }, { getPayloadClient }, dbModule, drizzle, sharp] =
      await Promise.all([
        import("@aws-sdk/client-s3"),
        import("@/server/payload"),
        import("@/server/db"),
        import("drizzle-orm"),
        import("sharp"),
      ]);
    // The storage adapter's only way out to S3. Record and answer locally.
    vi.spyOn(S3.prototype, "send").mockImplementation(((command: {
      constructor: { name: string };
      input: { Key?: string };
    }) => {
      calls.push({
        command: command.constructor.name,
        key: command.input.Key ?? "",
      });
      return Promise.resolve({});
    }) as never);
    payload = await getPayloadClient();
    db = dbModule.db;
    sql = drizzle.sql;
    // Big enough that every image size (up to 1440 wide) is generated.
    png = await sharp
      .default({
        create: {
          width: 1600,
          height: 900,
          channels: 3,
          background: "#ff8800",
        },
      })
      .png()
      .toBuffer();
  }, 120_000);

  beforeEach(() => {
    calls.length = 0;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (created.length > 0) {
      await db.execute(
        sql`DELETE FROM "media" WHERE "id" IN (${sql.join(
          created.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
  });

  it("stores a new upload with no prefix under media/", async () => {
    const doc = await create({}, "new");

    expect(doc.prefix).toBe("media");
    expect(doc.url).toBe(`${base()}/media/${doc.filename}`);
    expect(doc.sizes?.thumbnail?.url).toBe(
      `${base()}/media/${doc.sizes!.thumbnail!.filename}`,
    );
    const puts = keysOf("PutObjectCommand");
    // The original plus its four image sizes, all in the folder.
    expect(puts).toHaveLength(5);
    expect(puts).toContain(`media/${doc.filename}`);
    expect(puts.every((key) => key.startsWith("media/"))).toBe(true);
    const stored = await row(doc.id);
    expect(stored.prefix).toBe("media");
    expect(stored.url).toBe(`${base()}/media/${doc.filename}`);
  });

  it("stores an empty prefix under media/ too", async () => {
    const doc = await create({ prefix: "" }, "empty");

    expect(doc.prefix).toBe("media");
    expect(
      keysOf("PutObjectCommand").every((key) => key.startsWith("media/")),
    ).toBe(true);
  });

  it("keeps a prefix the caller chose", async () => {
    const doc = await create({ prefix: "magazines/7" }, "magazine");

    expect(doc.prefix).toBe("magazines/7");
    expect(doc.url).toBe(`${base()}/magazines/7/${doc.filename}`);
    const puts = keysOf("PutObjectCommand");
    expect(puts).toHaveLength(5);
    expect(puts.every((key) => key.startsWith("magazines/7/"))).toBe(true);
  });

  it.each([
    ["empty", "" as const],
    ["null", null],
  ])(
    "writes a replaced file of an old root doc (prefix %s) under media/",
    async (_label, oldPrefix) => {
      const old = await oldRootDoc(oldPrefix);
      const oldKeys = [
        old.filename,
        ...Object.values(old.sizes ?? {}).map((size) => size?.filename),
      ];

      const doc = await payload.update({
        collection: "media",
        id: old.id,
        data: {},
        file: file("replacement"),
      });

      expect(doc.prefix).toBe("media");
      expect(doc.url).toBe(`${base()}/media/${doc.filename}`);
      const puts = keysOf("PutObjectCommand");
      expect(puts).toHaveLength(5);
      expect(puts.every((key) => key.startsWith("media/"))).toBe(true);
      // The old files are removed from where they really are: the root.
      expect(keysOf("DeleteObjectCommand").sort()).toEqual([...oldKeys].sort());
      expect((await row(old.id)).prefix).toBe("media");
    },
  );

  it.each([
    ["empty", "" as const],
    ["null", null],
  ])(
    "leaves an old root doc (prefix %s) at the root when only its alt changes",
    async (_label, oldPrefix) => {
      const old = await oldRootDoc(oldPrefix);

      const doc = await payload.update({
        collection: "media",
        id: old.id,
        data: { alt: "A new description" },
      });

      expect(doc.alt).toBe("A new description");
      expect(doc.prefix).toBe("");
      expect(doc.url).toBe(`${base()}/${old.filename}`);
      expect(doc.sizes?.thumbnail?.url).toBe(
        `${base()}/${old.sizes!.thumbnail!.filename}`,
      );
      expect(calls).toEqual([]);
      const stored = await row(old.id);
      expect(stored.prefix ?? "").toBe("");
      expect(stored.url).toBe(`${base()}/${old.filename}`);
      for (const size of SIZES) {
        expect(doc.sizes?.[size]?.url).toBe(
          `${base()}/${old.sizes![size]!.filename}`,
        );
        expect(stored[`sizes_${size}_url`]).toBe(
          `${base()}/${old.sizes![size]!.filename}`,
        );
      }
    },
  );

  it("reads an old root doc with a null prefix at its root URL", async () => {
    const old = await oldRootDoc(null);

    const doc = await payload.findByID({ collection: "media", id: old.id });

    expect(doc.prefix).toBe("");
    expect(doc.url).toBe(`${base()}/${old.filename}`);
    expect((await row(old.id)).prefix).toBeNull();
  });

  it("deletes an old root doc's files from the root", async () => {
    const old = await oldRootDoc(null);
    const oldKeys = [
      old.filename,
      ...Object.values(old.sizes ?? {}).map((size) => size?.filename),
    ];

    await payload.delete({ collection: "media", id: old.id });

    expect(keysOf("DeleteObjectCommand").sort()).toEqual([...oldKeys].sort());
  });

  // The `filename` unique index is global, so the free-name check must be
  // global too, whatever prefix the caller sends.
  it("renames a new file whose name an old root file already has", async () => {
    // Not ending in digits: Payload's renamer increments a trailing number.
    const name = `media-prefix-taken-${sfx}-x.png`;
    const old = await oldRootDoc("", name);
    expect(old.filename).toBe(name);

    const withPrefix = await create({ prefix: "media" }, "taken", { name });
    const withoutPrefix = await create({}, "taken", { name });

    expect(withPrefix.filename).toBe(`media-prefix-taken-${sfx}-x-1.png`);
    expect(withPrefix.prefix).toBe("media");
    expect(withPrefix.url).toBe(`${base()}/media/${withPrefix.filename}`);
    expect(withoutPrefix.filename).toBe(`media-prefix-taken-${sfx}-x-2.png`);
    expect(withoutPrefix.prefix).toBe("media");
    expect((await row(old.id)).filename).toBe(name);
  });

  it("refuses a focal-point edit of an old root image and changes nothing", async () => {
    const old = await oldRootDoc("");
    const before = await row(old.id);
    const fetchSpy = serveStoredFiles();
    try {
      await expect(payload.update(focalEdit(old))).rejects.toThrow(
        LEGACY_ROOT_EDIT_MESSAGE,
      );
    } finally {
      fetchSpy.mockRestore();
    }

    expect(keysOf("PutObjectCommand")).toEqual([]);
    expect(keysOf("DeleteObjectCommand")).toEqual([]);
    expect(await row(old.id)).toEqual(before);
  });

  it("re-writes a media/ image in place when its focal point moves", async () => {
    const doc = await create({}, "focal");
    calls.length = 0;
    const keys = [
      `media/${doc.filename}`,
      ...SIZES.map((size) => `media/${doc.sizes![size]!.filename}`),
    ].sort();
    const fetchSpy = serveStoredFiles();
    let edited: Media;
    try {
      edited = await payload.update(focalEdit(doc));
    } finally {
      fetchSpy.mockRestore();
    }

    expect(edited.focalX).toBe(20);
    expect(edited.prefix).toBe("media");
    expect(edited.filename).toBe(doc.filename);
    expect(edited.url).toBe(doc.url);
    expect(keysOf("PutObjectCommand").sort()).toEqual(keys);
    expect(keysOf("DeleteObjectCommand").sort()).toEqual(keys);
    expect(Number((await row(doc.id)).focal_x)).toBe(20);
  });

  it.each([
    "private/classroom/1",
    "media/gallery/public/1",
    ".",
    "magazines/x",
  ])(
    "refuses a caller prefix outside the allowed folders (%s)",
    async (prefix) => {
      await expect(create({ prefix }, "bad")).rejects.toThrow(
        /can only be stored under/,
      );
      expect(keysOf("PutObjectCommand")).toEqual([]);
    },
  );

  it("ignores a prefix sent through access-checked (REST) writes", async () => {
    const doc = await create({ prefix: "private/classroom/1" }, "rest", {
      overrideAccess: false,
    });

    expect(doc.prefix).toBe("media");
    expect(
      keysOf("PutObjectCommand").every((key) => key.startsWith("media/")),
    ).toBe(true);
    calls.length = 0;

    const updated = await payload.update({
      collection: "media",
      id: doc.id,
      data: { prefix: "magazines/7" },
      overrideAccess: false,
      user: {
        id: 1,
        collection: "users",
        email: "admin@example.test",
      } as never,
    });

    expect(updated.prefix).toBe("media");
    expect((await row(doc.id)).prefix).toBe("media");
    expect(calls).toEqual([]);
  });
});
