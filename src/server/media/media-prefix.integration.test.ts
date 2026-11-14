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

import type { db as Db } from "@/server/db";
import type { sql as Sql } from "drizzle-orm";
import type { Payload } from "payload";

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
  url: string | null;
  sizes_thumbnail_url: string | null;
};

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

  function file(label: string) {
    seq += 1;
    return {
      data: png,
      mimetype: "image/png",
      name: `media-prefix-${label}-${sfx}-${seq}.png`,
      size: png.byteLength,
    };
  }

  async function create(data: Record<string, unknown>, label: string) {
    const doc = await payload.create({
      collection: "media",
      data: { alt: "A test picture", ...data } as never,
      file: file(label),
    });
    created.push(doc.id);
    return doc;
  }

  async function row(id: number): Promise<MediaRow> {
    const res = await db.execute(
      sql`SELECT "prefix", "url", "sizes_thumbnail_url" FROM "media" WHERE "id" = ${id}`,
    );
    return res.rows[0] as MediaRow;
  }

  /** A doc as it was stored before the folder rule: at the bucket root. */
  async function oldRootDoc(prefix: "" | null) {
    const doc = await create({}, "old");
    await db.execute(sql`
      UPDATE "media" SET
        "prefix" = ${prefix},
        "url" = ${`${base()}/${doc.filename}`},
        "sizes_thumbnail_url" = ${`${base()}/${doc.sizes!.thumbnail!.filename}`}
      WHERE "id" = ${doc.id}
    `);
    calls.length = 0;
    return doc;
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
      expect(stored.sizes_thumbnail_url).toBe(
        `${base()}/${old.sizes!.thumbnail!.filename}`,
      );
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
});
